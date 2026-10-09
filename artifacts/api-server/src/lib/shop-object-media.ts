import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pool } from "@workspace/db";
import { ObjectStorageService, objectStorageClient } from "./objectStorage";
import { setObjectAclPolicy } from "./objectAcl";
import { SHOP_TEST_DIR, SHOP_ORIGINALS, ShopError, type State } from "./shop-test";
import { shopStripeMode } from "./shop-stripe-catalog";

const storage = new ObjectStorageService();
function finalObject(name: string) {
  const parts = storage.getPrivateObjectDir().split("/").filter(Boolean);
  if (!parts[0] || parts.length < 2) throw new ShopError("App Storage privé indisponible.", 503);
  return objectStorageClient.bucket(parts[0]).file(`${parts.slice(1).join("/")}/shop/${shopStripeMode()}/photos/${name}`);
}
function extension(contentType: string) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) throw new ShopError("Format photo invalide.");
  return contentType.split("/")[1]!;
}
export async function requestPrivateShopPhoto(contentType: string, size: number) {
  const ext = extension(contentType);
  const url = await storage.getObjectEntityUploadURL();
  const reference = `upload:${randomUUID()}.${ext}`;
  await pool.query(`INSERT INTO shop_media(mode,reference,object_path,content_type,size) VALUES($1,$2,$3,$4,$5)`,
    [shopStripeMode(), reference, storage.normalizeObjectEntityPath(url), contentType, size]);
  return { reference, url };
}
export async function completePrivateShopPhoto(reference: string, owner: string, validate: (bytes: Buffer, type: string) => string) {
  const mode = shopStripeMode();
  const result = await pool.query("SELECT * FROM shop_media WHERE mode=$1 AND reference=$2", [mode, reference]);
  if (!result.rowCount) throw new ShopError("Envoi photo inconnu.", 404);
  const row = result.rows[0];
  if (row.ready === "ready") return { reference };
  const incoming = await storage.getObjectEntityFile(row.object_path);
  const [metadata] = await incoming.getMetadata();
  if (Number(metadata.size) !== row.size || metadata.contentType !== row.content_type) throw new ShopError("La photo reçue ne correspond pas à l’envoi déclaré.");
  const [bytes] = await incoming.download();
  const ext = validate(bytes, row.content_type);
  if (!reference.endsWith(`.${ext}`)) throw new ShopError("Format réel de la photo incorrect.");
  // The signed staging URL cannot overwrite the final immutable photo.
  const finalName = `${randomUUID()}.${ext}`;
  const destination = finalObject(finalName);
  await destination.save(bytes, { resumable: false, metadata: { contentType: row.content_type } });
  await setObjectAclPolicy(destination, { owner, visibility: "private" });
  await pool.query(`UPDATE shop_media SET object_path=$1,ready='ready',sha256=$2 WHERE mode=$3 AND reference=$4 AND ready='pending'`,
    [`/objects/shop/${mode}/photos/${finalName}`, createHash("sha256").update(bytes).digest("hex"), mode, reference]);
  return { reference };
}
export async function importTestShopPhotos(state: State, validate: (bytes: Buffer, type: string) => string) {
  if (process.env.NODE_ENV !== "development") throw new ShopError("Import photo réservé à TEST.", 403);
  const references = new Set(state.products.flatMap(p => p.variants.flatMap(v => v.photos.map(photo => photo.reference))));
  for (const reference of references) {
    const filename = reference.startsWith("original:") && SHOP_ORIGINALS.includes(reference.slice(9) as typeof SHOP_ORIGINALS[number])
      ? path.resolve(SHOP_TEST_DIR, "../../attached_assets", reference.slice(9))
      : /^upload:[a-f0-9-]{36}\.(png|jpeg|webp)$/.test(reference)
        ? path.join(SHOP_TEST_DIR, `.env.photo-${reference.slice(7)}.store`) : null;
    if (!filename) throw new ShopError("Référence originale inconnue.");
    const bytes = await fs.readFile(filename);
    const contentType = reference.endsWith(".png") ? "image/png" : reference.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const ext = validate(bytes, contentType);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const existing = await pool.query("SELECT sha256,ready FROM shop_media WHERE mode='test' AND reference=$1", [reference]);
    if (existing.rowCount) {
      if (existing.rows[0].sha256 !== sha || existing.rows[0].ready !== "ready") throw new ShopError("Une photo persistante différente existe déjà. Import arrêté.", 409);
      continue;
    }
    const name = `${randomUUID()}.${ext}`;
    const file = finalObject(name);
    await file.save(bytes, { resumable: false, metadata: { contentType } });
    await setObjectAclPolicy(file, { owner: "shop-test-import", visibility: "private" });
    await pool.query(`INSERT INTO shop_media(mode,reference,object_path,content_type,size,ready,sha256) VALUES('test',$1,$2,$3,$4,'ready',$5)`,
      [reference, `/objects/shop/test/photos/${name}`, contentType, bytes.length, sha]);
  }
  return references.size;
}
