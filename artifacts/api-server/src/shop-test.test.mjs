import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

test("Private Shop TEST: real storage, admin guard, CRUD, stock and isolation", async t => {
  process.env.NODE_ENV = "development";
  process.env.SHOP_TEST_PERSISTENCE = "files";
  const root = path.resolve(process.cwd(), "../..");
  const dir = await fs.mkdtemp(path.join(tmpdir(), "shop-harness-"));
  const file = path.join(root, ".local/shop-test/.env.validation-state.store");
  // Only this test's isolated file is used. Never touch the actual Shop catalog.
  const fixture = path.join(dir, ".env.validation-state.store");
  let server;
  const photoFiles = [];
  try {
    await build({
      entryPoints: ["src/routes/shop-test.ts", "src/lib/shop-test.ts"],
      absWorkingDir: process.cwd(), outdir: dir, outExtension: { ".js": ".mjs" },
      platform: "node", format: "esm", bundle: true,
      banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
      plugins: [{ name: "shop-fixtures", setup(builder) {
        builder.onResolve({ filter: /shop-repository$/ }, () => ({ path: "repository-fixture", namespace: "fixture" }));
        builder.onLoad({ filter: /repository-fixture/, namespace: "fixture" }, () => ({ contents: `
          import {shopTest} from ${JSON.stringify(path.join(root, "artifacts/api-server/src/lib/shop-test.ts"))};
          export const shop = shopTest; export const persistentShop = {}; export const isPersistentShop = () => false;
        `, loader: "js", resolveDir: root }));
        builder.onResolve({ filter: /shop-object-media$/ }, () => ({ path: "media-fixture", namespace: "fixture" }));
        builder.onLoad({ filter: /media-fixture/, namespace: "fixture" }, () => ({ contents: `
          export const requestPrivateShopPhoto = async () => {throw new Error("not used")};
          export const completePrivateShopPhoto = async () => {throw new Error("not used")};
        `, loader: "js" }));
        builder.onLoad({ filter: /\/lib\/shop-test\.ts$/ }, async args => ({
          contents: (await fs.readFile(args.path, "utf8")).replace("export const shopTest = new ShopTestRepository();", `export const shopTest = new ShopTestRepository(${JSON.stringify(fixture)});`), loader: "ts",
        }));
        builder.onResolve({ filter: /^@clerk\/express$/ }, () => ({ path: "clerk-fixture", namespace: "fixture" }));
        builder.onLoad({ filter: /clerk-fixture/, namespace: "fixture" }, () => ({ contents: `
          export const getAuth = req => ({userId:req.get("x-test-account") || null});
          export const clerkClient = {users:{getUser:async id => ({
            primaryEmailAddressId:"primary",emailAddresses:[{id:"primary",
              emailAddress:id === "admin" || id === "unverified-admin" ? "indamorarecords@gmail.com" : id+"@example.test",
              verification:{status:id === "unverified-admin" ? "unverified":"verified"}}]
          })}};
        `, loader: "js" }));
        builder.onResolve({ filter: /storeStripeClient$/ }, () => ({ path: "stripe-fixture", namespace: "fixture" }));
        builder.onLoad({ filter: /stripe-fixture/, namespace: "fixture" }, () => ({ contents: `
          export async function storeStripeApi() { return {data:[]}; }
        `, loader: "js" }));
      } }],
    });
    const { default: router, validateImage, uploadFilename } = await import(pathToFileURL(path.join(dir, "routes/shop-test.mjs")).href);
    const { ShopTestRepository, initialShopState, quoteCart } = await import(pathToFileURL(path.join(dir, "lib/shop-test.mjs")).href);
    const { default: express } = await import("express");
    const app = express();
    app.use(express.json({ limit: "7mb" }));
    app.use((req,_res,next) => { req.log = { error(){}, warn(){}, info(){} }; next(); });
    app.use("/api", router);
    server = app.listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/shop`;
    const request = (url, role, method = "GET", body, extra = {}) => fetch(`${base}${url}`, {
      method, headers: { ...(role ? {"x-test-account":role} : {}), ...(body ? {"content-type":"application/json"} : {}), ...extra },
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
    let saved;
    const input = { name: "Article de validation TEST", description: "Produit isolé, pas une commande réelle", category: "T-shirts", priceCents: 1700,
      status: "draft", visible: true, shippingInfo: "", variants: [{id:"rose",color:"Rose",size:"Taille unique",stock:3,photos:[{reference:"original:IMG_3390_1791538149840.jpeg"}]}] };
    await t.test("guest, artist, subscriber, ordinary user and unverified admin cannot read or write", async () => {
      for (const role of [undefined,"artist","subscriber","user","unverified-admin"]) {
        for (const [url,method,body] of [["/admin","GET"],["/admin/products","POST",input],["/admin/orders","GET"],["/admin/photos","POST",{contentType:"image/png",base64:"AAAA"}]]) {
          const result = await request(url,role,method,body);
          assert.equal(result.status, role ? 403 : 401);
          assert.ok(!JSON.stringify(await result.json()).includes("variants"));
        }
      }
      await assert.rejects(fs.stat(fixture), {code:"ENOENT"});
    });
    await t.test("verified existing admin creates draft, edits variants/price/stock and records history", async () => {
      assert.equal((await request("/admin","admin")).status,200);
      const response = await request("/admin/products","admin","POST",input);
      assert.equal(response.status,200);
      saved = await response.json();
      assert.equal(saved.priceCents,1700);
      const update = { ...input, priceCents:1900, description:"Description modifiée", variants:[{...input.variants[0],stock:7}], revision:saved.revision };
      const changed = await request(`/admin/products/${saved.id}`,"admin","PUT",update);
      assert.equal(changed.status,200); saved = await changed.json();
      assert.equal(saved.variants[0].stock,7); assert.equal(saved.priceCents,1900);
      const dashboard = await (await request("/admin","admin")).json();
      assert.equal(dashboard.products.length,5); assert.equal(dashboard.unknownStock,4);
      assert.equal(dashboard.history.length,2);
    });
    await t.test("separate process reopens stored data; atomic backup exists; no reset or duplicates", async () => {
      const again = new ShopTestRepository(fixture);
      assert.equal((await again.read()).products.find(p => p.id === saved.id).priceCents,1900);
      const result = spawnSync(process.execPath, ["--input-type=module","-e", `import {readFileSync} from "node:fs"; const v=JSON.parse(readFileSync(${JSON.stringify(fixture)},"utf8")); if(v.products.find(p=>p.id===${JSON.stringify(saved.id)}).variants[0].stock!==7)process.exit(1);`]);
      assert.equal(result.status,0);
      assert.equal(JSON.parse(await fs.readFile(`${fixture}.backup`,"utf8")).products.length,5);
      assert.equal((await fs.stat(fixture)).mode & 0o777,0o600);
    });
    await t.test("negative stock, invalid price, duplicate variants and stale revisions refused", async () => {
      for (const value of [
        {...input,priceCents:0}, {...input,variants:[{...input.variants[0],stock:-1}]},
        {...input,variants:[input.variants[0],input.variants[0]]},
      ]) assert.equal((await request("/admin/products","admin","POST",value)).status,400);
      assert.equal((await request(`/admin/products/${saved.id}`,"admin","PUT",{...input,revision:0})).status,409);
      assert.equal((await (await request("/admin","admin")).json()).products.length,5);
    });
    await t.test("draft hidden from public and private photos denied; active changes visible without internal stocks", async () => {
      assert.ok(!(await (await request("/catalog")).json()).products.some(p => p.id === saved.id));
      const photo = await fs.readFile(path.join(root,"attached_assets/IMG_3395_1791538149840.jpeg"));
      const response = await request("/admin/photos","admin","POST",{contentType:"image/jpeg",base64:photo.toString("base64")});
      assert.equal(response.status,200); const reference = (await response.json()).reference;
      photoFiles.push(uploadFilename(reference));
      assert.ok(uploadFilename(reference).endsWith(".store"), "Never give private uploads an extension that Metro can bundle or serve as an asset");
      assert.equal((await request(`/media?reference=${encodeURIComponent(reference)}`)).status,401);
      assert.equal((await request(`/media?reference=${encodeURIComponent(reference)}`,"artist")).status,403);
      assert.equal((await request(`/media?reference=${encodeURIComponent(reference)}`,"admin")).status,200);
      const updated = {...input, status:"active", priceCents:1900, variants:[{...input.variants[0],stock:7,photos:[{reference}]}],revision:saved.revision};
      saved = await (await request(`/admin/products/${saved.id}`,"admin","PUT",updated)).json();
      const catalog = await (await request("/catalog")).json();
      const product = catalog.products.find(p=>p.id===saved.id);
      assert.equal(product.priceCents,1900); assert.equal(product.variants[0].available,true);
      assert.equal("stock" in product.variants[0],false); assert.equal("history" in catalog,false);
      assert.equal((await request(`/media?reference=${encodeURIComponent(reference)}`)).status,200);
      assert.equal((await request(`/admin/products/${saved.id}`,"admin","PUT",{...updated,status:"hidden",revision:saved.revision})).status,200);
      assert.ok(!(await (await request("/catalog")).json()).products.some(p=>p.id===saved.id));
      saved = await (await request(`/admin/products/${saved.id}`,"admin","PUT",{...updated,revision:saved.revision+1})).json();
      assert.ok((await (await request("/catalog")).json()).products.some(p=>p.id===saved.id));
    });
    await t.test("server calculates totals, rejects price overrides, missing stock and overselling", async () => {
      const items = [{productId:saved.id,variantId:"rose",quantity:2}];
      for (const [country,total] of [["FR",3800],["DE",4500],["GB",null],["US",null]]) {
        const response = await request("/quote",undefined,"POST",{items,shippingCountry:country});
        assert.equal(response.status,200); assert.equal((await response.json()).totalCents,total);
      }
      assert.equal((await request("/quote",undefined,"POST",{items,shippingCountry:"FR",priceCents:1})).status,400);
      assert.equal((await request("/quote",undefined,"POST",{items:[{...items[0],quantity:8}],shippingCountry:"FR"})).status,409);
      assert.equal((await request("/quote",undefined,"POST",{items:[{productId:"tshirt",variantId:"rose",quantity:1}],shippingCountry:"FR"})).status,409);
    });
    await t.test("reservations prevent concurrent oversell; paid confirmation decreases once; no negative stock", async () => {
      const repository = new ShopTestRepository(fixture);
      const items = [{productId:saved.id,variantId:"rose",quantity:5}];
      await repository.reserve("reservation-test",items,"FR",new Map([[saved.id,1900]]));
      await assert.rejects(repository.reserve("duplicate-hold",items,"FR",new Map([[saved.id,1900]])));
      await repository.attachSession("reservation-test","cs_test_fixture_stock");
      await repository.settleSession("cs_test_fixture_stock",true,false);
      await repository.settleSession("cs_test_fixture_stock",true,false);
      assert.equal((await repository.read()).products.find(p=>p.id===saved.id).variants[0].stock,2);
      assert.throws(() => quoteCart(initialShopState(),[{productId:"bob",variantId:"blanc",quantity:1}],"FR"));
    });
    await t.test("invalid files, traversal, foreign origins and production endpoints are rejected", async () => {
      assert.throws(()=>validateImage(Buffer.from("<svg/>"),"image/png"));
      assert.equal(uploadFilename("upload:../../.env"),null);
      assert.equal((await request("/admin","admin","GET",undefined,{origin:"https://attacker.example"})).status,403);
      assert.equal((await request("/media?reference=original:../../.env","admin")).status,404);
      const original = await fs.readFile(fixture,"utf8");
      await fs.writeFile(fixture,"broken JSON");
      assert.equal((await request("/admin/products","admin","POST",input)).status,503);
      assert.equal(await fs.readFile(fixture,"utf8"),"broken JSON");
      await fs.writeFile(fixture,original);
      process.env.NODE_ENV="production";
      for(const url of ["/admin","/catalog","/admin/orders","/media?reference=x"]) assert.equal((await request(url,"admin")).status,404);
      process.env.NODE_ENV="development";
    });
    // This output records a process-independent persistence probe in the private
    // project directory. It contains only synthetic TEST product data, no PII.
    await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
    await fs.copyFile(fixture,file);
    await fs.chmod(file,0o600);
  } finally {
    process.env.NODE_ENV="development";
    if(server) await new Promise(resolve=>server.close(resolve));
    for(const filename of photoFiles) await fs.unlink(filename).catch(()=>{});
    await fs.rm(dir,{recursive:true,force:true});
  }
});
