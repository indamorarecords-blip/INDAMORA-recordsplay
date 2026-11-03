import { Readable } from "stream";
import { getAuth } from "@clerk/express";
import { Router, type IRouter, type Response } from "express";
import {
  CompleteUploadBody,
  CompleteUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { requireAuth, isAdminUser } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const pendingUploads = new Map<string, string>();
const storage = new ObjectStorageService();

const streamResponse = async (
  response: Response,
  result: globalThis.Response,
) => {
  response.status(result.status);
  result.headers.forEach((value, key) => response.setHeader(key, value));

  if (result.body) {
    Readable.fromWeb(result.body as ReadableStream<Uint8Array>).pipe(response);
  } else {
    response.end();
  }
};

router.post("/storage/uploads/request-url", requireAuth, async (req, res) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Métadonnées de fichier invalides." });
    return;
  }

  const allowed = [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/ogg",
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  const max = parsed.data.contentType.startsWith("video/")
    ? 500 * 1024 * 1024
    : parsed.data.contentType.startsWith("audio/")
      ? 100 * 1024 * 1024
      : 10 * 1024 * 1024;

  if (
    !allowed.includes(parsed.data.contentType) ||
    parsed.data.size > max
  ) {
    res.status(400).json({ error: "Type ou taille de fichier non autorisé." });
    return;
  }

  try {
    const uploadURL = await storage.getObjectEntityUploadURL();
    const objectPath = storage.normalizeObjectEntityPath(uploadURL);
    pendingUploads.set(req.clerkUserId!, objectPath);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: parsed.data,
      }),
    );
  } catch (error) {
    req.log.error({ error }, "Unable to sign Supabase upload URL");
    res.status(500).json({ error: "Impossible de préparer l'upload." });
  }
});

router.post("/storage/uploads/complete", requireAuth, async (req, res) => {
  const parsed = CompleteUploadBody.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "Chemin d'objet invalide." });
    return;
  }

  try {
    const objectPath = await storage.setAcl(parsed.data.objectPath, {
      owner: req.clerkUserId!,
      visibility: "private",
    });

    res.json(CompleteUploadResponse.parse({ objectPath }));
  } catch (error) {
    req.log.error({ error }, "Unable to finalize Supabase upload");
    res.status(400).json({ error: "Upload introuvable ou incomplet." });
  }
});

router.get("/storage/public-objects/*filePath", async (req, res) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.searchPublicObject(filePath);

    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    await streamResponse(res, await storage.downloadObject(file));
  } catch (error) {
    req.log.error({ error }, "Unable to serve public Supabase object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

router.get("/storage/objects/*path", async (req, res) => {
  try {
    const raw = req.params.path;
    const path = `/objects/${Array.isArray(raw) ? raw.join("/") : raw}`;

    const file = await storage.getObjectEntityFile(path);
    const userId = getAuth(req).userId ?? undefined;
    const admin = userId ? await isAdminUser(userId) : false;

    const allowed =
      admin ||
      await storage.canAccessObjectEntity({
        userId,
        objectFile: file,
        requestedPermission: ObjectPermission.READ,
      });

    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    await streamResponse(
      res,
      await storage.downloadObject(file, req.headers.range),
    );
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }

    req.log.error({ error }, "Unable to serve Supabase object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});
router.put("/storage/uploads/send", requireAuth, async (req, res) => {
  const userId = req.clerkUserId!;
  const objectPath = pendingUploads.get(userId);

  if (!objectPath) {
    res.status(400).json({ error: "Aucun upload en attente." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "indamora-media";

  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: "Configuration Supabase manquante." });
    return;
  }

  try {
    const path = objectPath.replace(/^\/objects\//, "");
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");

    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${bucket}/${encodedPath}`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": req.headers["content-type"] || "application/octet-stream",
          "x-upsert": "false",
        },
        body: req as any,
        duplex: "half",
      } as any,
    );

    if (!response.ok) {
      const details = await response.text();
      req.log.error({ status: response.status, details }, "Supabase upload failed");
      res.status(502).json({ error: "Échec du transfert vers Supabase." });
      return;
    }

    const completedPath = await storage.setAcl(objectPath, {
      owner: userId,
      visibility: "private",
    });

    pendingUploads.delete(userId);

    res.json({ objectPath: completedPath });
  } catch (error) {
    req.log.error({ error }, "Upload send failed");
    res.status(500).json({ error: "Erreur pendant le téléversement." });
  }
});
export default router;
