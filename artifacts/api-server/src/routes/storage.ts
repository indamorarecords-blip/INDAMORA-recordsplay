import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, or } from "drizzle-orm";
import { CompleteUploadBody, CompleteUploadResponse, RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { db, submissionsTable, worksTable } from "@workspace/db";
import { requireAuth, isAdminUser } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { getObjectAclPolicy, ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const streamResponse = async (response: Response, result: globalThis.Response) => {
  response.status(result.status);
  result.headers.forEach((value, key) => response.setHeader(key, value));
  if (result.body) Readable.fromWeb(result.body as ReadableStream<Uint8Array>).pipe(response);
  else response.end();
};

router.post("/storage/uploads/request-url", requireAuth, async (req, res) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Métadonnées de fichier invalides." }); return; }
  const allowed = ["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg", "video/mp4", "video/webm", "video/quicktime", "image/jpeg", "image/png", "image/webp"];
  const max = parsed.data.contentType.startsWith("video/") ? 500 * 1024 * 1024 : parsed.data.contentType.startsWith("audio/") ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
  if (!allowed.includes(parsed.data.contentType) || parsed.data.size > max) { res.status(400).json({ error: "Type ou taille de fichier non autorisé." }); return; }
  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: parsed.data }));
  } catch (error) { req.log.error({ error }, "Unable to sign upload URL"); res.status(500).json({ error: "Impossible de préparer l'upload." }); }
});

router.post("/storage/uploads/complete", requireAuth, async (req, res) => {
  const parsed = CompleteUploadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Chemin d'objet invalide." }); return; }
  try {
    const objectFile = await storage.getObjectEntityFile(parsed.data.objectPath);
    const existingPolicy = await getObjectAclPolicy(objectFile);
    if (existingPolicy && existingPolicy.owner !== req.clerkUserId) {
      res.status(403).json({ error: "Cet objet appartient déjà à un autre compte." });
      return;
    }
    const path = await storage.setAcl(parsed.data.objectPath, { owner: req.clerkUserId!, visibility: "private" });
    res.json(CompleteUploadResponse.parse({ objectPath: path }));
  } catch (error) { req.log.error({ error }, "Unable to finalize upload"); res.status(400).json({ error: "Upload introuvable ou incomplet." }); }
});

router.get("/storage/public-objects/*filePath", async (req, res) => {
  try {
    const raw = req.params.filePath;
    const file = await storage.searchPublicObject(Array.isArray(raw) ? raw.join("/") : raw);
    if (!file) { res.status(404).json({ error: "File not found" }); return; }
    await streamResponse(res, await storage.downloadObject(file));
  } catch (error) { req.log.error({ error }, "Unable to serve public object"); res.status(500).json({ error: "Failed to serve public object" }); }
});

router.get("/storage/objects/*path", async (req, res) => {
  try {
    const raw = req.params.path;
    const file = await storage.getObjectEntityFile(`/objects/${Array.isArray(raw) ? raw.join("/") : raw}`);
    const userId = getAuth(req).userId ?? undefined;
    const admin = userId ? await isAdminUser(userId) : false;
    const allowed = admin || await storage.canAccessObjectEntity({ userId, objectFile: file, requestedPermission: ObjectPermission.READ });
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
    await streamResponse(res, await storage.downloadObject(file, req.headers.range));
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Object not found" }); return; }
    req.log.error({ error }, "Unable to serve object"); res.status(500).json({ error: "Failed to serve object" });
  }
});

router.delete("/storage/objects/*path", requireAuth, async (req, res) => {
  try {
    const raw = req.params.path;
    const objectPath = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;
    const file = await storage.getObjectEntityFile(objectPath);
    const policy = await getObjectAclPolicy(file);
    const admin = await isAdminUser(req.clerkUserId!);
    if (!admin && policy?.owner !== req.clerkUserId) {
      res.status(403).json({ error: "Vous ne pouvez pas supprimer ce fichier." });
      return;
    }
    const [submissionReference, workReference] = await Promise.all([
      db.select({ id: submissionsTable.id }).from(submissionsTable).where(or(
        eq(submissionsTable.mediaObjectPath, objectPath),
        eq(submissionsTable.coverObjectPath, objectPath),
      )).limit(1),
      db.select({ id: worksTable.id }).from(worksTable).where(or(
        eq(worksTable.mediaObjectPath, objectPath),
        eq(worksTable.coverObjectPath, objectPath),
      )).limit(1),
    ]);
    if (submissionReference.length || workReference.length) {
      res.status(409).json({ error: "Ce fichier est encore utilisé et ne peut pas être supprimé." });
      return;
    }
    await storage.deleteObjectEntity(objectPath);
    res.status(204).end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ error }, "Unable to delete object");
    res.status(500).json({ error: "Impossible de supprimer ce fichier." });
  }
});

export default router;