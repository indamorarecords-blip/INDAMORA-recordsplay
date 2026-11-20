import { Readable } from “stream”;
import { getAuth } from “@clerk/express”;
import { Router, type IRouter } from “express”;
import {
CompleteUploadBody,
CompleteUploadResponse,
RequestUploadUrlBody,
RequestUploadUrlResponse,
} from “@workspace/api-zod”;
import { requireAuth, isAdminUser } from “../middlewares/auth”;
import {
ObjectNotFoundError,
ObjectStorageService,
} from “../lib/objectStorage”;
import { ObjectPermission } from “../lib/objectAcl”;

const router: IRouter = Router();
const storage = new ObjectStorageService();

const PRESS_COVER_TYPES = [
“image/jpeg”,
“image/png”,
“image/webp”,
];

const MAX_PRESS_COVER_SIZE = 10 * 1024 * 1024;

async function streamResponse(
res: any,
result: globalThis.Response
) {
res.status(result.status);

result.headers.forEach((value, key) => {
res.setHeader(key, value);
});

if (result.body) {
Readable.fromWeb(
result.body as ReadableStream
).pipe(res);
} else {
res.end();
}
}

// 1. Préparer l’envoi du fichier
router.post(
“/storage/uploads/request-url”,
requireAuth,
async (req, res) => {
const parsed = RequestUploadUrlBody.safeParse(req.body);

if (!parsed.success) {
  res.status(400).json({
    error: "Informations du fichier invalides.",
  });
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
  parsed.data.size <= 0 ||
  parsed.data.size > max
) {
  res.status(400).json({
    error: "Format ou taille non autorisé.",
  });
  return;
}
try {
  const uploadURL =
    await storage.getObjectEntityUploadURL();
  const objectPath =
    storage.normalizeObjectEntityPath(uploadURL);
  res.json(
    RequestUploadUrlResponse.parse({
      uploadURL,
      objectPath,
      metadata: parsed.data,
    })
  );
} catch (error) {
  req.log.error(
    { error },
    "Erreur préparation upload"
  );
  res.status(500).json({
    error: "Impossible de préparer l'envoi.",
  });
}

}
);

// 2. Confirmer l’enregistrement d’un fichier privé
router.post(
“/storage/uploads/complete”,
requireAuth,
async (req, res) => {
const parsed = CompleteUploadBody.safeParse(req.body);

if (!parsed.success) {
  res.status(400).json({
    error: "Chemin du fichier invalide.",
  });
  return;
}
try {
  const file = await storage.getObjectEntityFile(
    parsed.data.objectPath
  );
  const metadata = await file.getMetadata();
  if (
    Number(metadata[0].size) <= 0
  ) {
    res.status(400).json({
      error: "Le fichier envoyé est vide.",
    });
    return;
  }
  const path = await storage.setAcl(
    parsed.data.objectPath,
    {
      owner: req.clerkUserId!,
      visibility: "private",
    }
  );
  res.json(
    CompleteUploadResponse.parse({
      objectPath: path,
    })
  );
} catch (error) {
  req.log.error(
    { error },
    "Erreur validation upload"
  );
  res.status(400).json({
    error: "Fichier introuvable ou incomplet.",
  });
}

}
);

// 3. CONFIRMER UNE COUVERTURE PUBLIQUE POUR LA PRESSE
router.post(
“/storage/press-covers/complete”,
requireAuth,
async (req, res) => {
const userId = req.clerkUserId;

if (!userId || !(await isAdminUser(userId))) {
  res.status(403).json({
    error: "Accès réservé aux administrateurs.",
  });
  return;
}
const parsed = CompleteUploadBody.safeParse(req.body);
if (!parsed.success) {
  res.status(400).json({
    error: "Chemin de couverture invalide.",
  });
  return;
}
try {
  // Vérifier l'existence du fichier avant toute modification ACL.
  const file = await storage.getObjectEntityFile(
    parsed.data.objectPath
  );
  const metadata = await file.getMetadata();
  const contentType = metadata[0].contentType;
  const size = Number(metadata[0].size);
  // Vérifier le type réel du fichier.
  if (!PRESS_COVER_TYPES.includes(contentType)) {
    res.status(400).json({
      error: "Seules les images JPG, PNG et WebP sont autorisées.",
    });
    return;
  }
  // Vérifier la taille réelle.
  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MAX_PRESS_COVER_SIZE
  ) {
    res.status(400).json({
      error: "La couverture doit peser moins de 10 Mo.",
    });
    return;
  }
  // Rendre uniquement cette couverture publique.
  const path = await storage.setAcl(
    parsed.data.objectPath,
    {
      owner: userId,
      visibility: "public",
    }
  );
  res.json({
    success: true,
    objectPath: path,
    contentType,
    size,
  });
} catch (error) {
  req.log.error(
    { error },
    "Erreur validation couverture presse"
  );
  res.status(400).json({
    error: "Impossible de valider la couverture.",
  });
}

}
);

// 4. Servir les fichiers publics
router.get(
“/storage/public-objects/*filePath”,
async (req, res) => {
try {
const raw = req.params.filePath;

  const file = await storage.searchPublicObject(
    Array.isArray(raw) ? raw.join("/") : raw
  );
  if (!file) {
    res.status(404).json({
      error: "Fichier introuvable.",
    });
    return;
  }
  await streamResponse(
    res,
    await storage.downloadObject(file)
  );
} catch (error) {
  req.log.error(
    { error },
    "Erreur lecture fichier public"
  );
  res.status(500).json({
    error: "Erreur lecture fichier.",
  });
}

}
);

// 5. Servir les fichiers privés avec vérification des droits
router.get(
“/storage/objects/*path”,
async (req, res) => {
try {
const raw = req.params.path;

  const file = await storage.getObjectEntityFile(
    `/objects/${
      Array.isArray(raw) ? raw.join("/") : raw
    }`
  );
  const userId = getAuth(req).userId ?? undefined;
  const admin = userId
    ? await isAdminUser(userId)
    : false;
  const allowed =
    admin ||
    await storage.canAccessObjectEntity({
      userId,
      objectFile: file,
      requestedPermission: ObjectPermission.READ,
    });
  if (!allowed) {
    res.status(403).json({
      error: "Accès refusé.",
    });
    return;
  }
  await streamResponse(
    res,
    await storage.downloadObject(
      file,
      req.headers.range
    )
  );
} catch (error) {
  if (error instanceof ObjectNotFoundError) {
    res.status(404).json({
      error: "Fichier introuvable.",
    });
    return;
  }
  req.log.error(
    { error },
    "Erreur lecture fichier privé"
  );
  res.status(500).json({
    error: "Erreur lecture fichier.",
  });
}

}
);

export default router;
