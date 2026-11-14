import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { getAuth } from "@clerk/express";
import { randomUUID } from "crypto";

const router = Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_MEDIA_BUCKET;

const MAX_SIZE = 100 * 1024 * 1024;

router.put(
  "/uploads-v2/send",
    (req, res) => {
    try {
      const { userId } = getAuth(req);

      if (!userId) {
        res.status(401).json({
  error: "Authentification requise",
});
return;
      }

      if (!supabaseUrl || !supabaseKey || !bucket) {
        return res.status(500).json({
          error: "Configuration Supabase incomplète",
        });
      }

      const contentType = req.headers["content-type"] || "";

      if (!contentType.startsWith("audio/")) {
        return res.status(415).json({
          error: "Format audio non accepté",
        });
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      req.on("data", (chunk: Buffer) => {
        totalSize += chunk.length;

        if (totalSize > MAX_SIZE) {
          req.destroy();
          return;
        }

        chunks.push(chunk);
      });

      req.on("end", async () => {
        try {
          if (totalSize === 0 || totalSize > MAX_SIZE) {
            return res.status(413).json({
              error: "Fichier vide ou trop volumineux",
            });
          }

          const audioBuffer = Buffer.concat(chunks);
          const supabase = createClient(
            supabaseUrl,
            supabaseKey
          );

          const extension =
            contentType.includes("wav") ? "wav" :
            contentType.includes("ogg") ? "ogg" :
            contentType.includes("mp4") ? "m4a" :
            "mp3";

          const objectPath =
            `uploads/${userId}/${randomUUID()}.${extension}`;

          const { error } = await supabase.storage
            .from(bucket)
            .upload(objectPath, audioBuffer, {
              contentType,
              upsert: false,
            });

          if (error) {
            console.error("[UPLOAD-V2]", error);

            return res.status(502).json({
              error: "Échec du transfert Supabase",
            });
          }

          return res.status(200).json({
            success: true,
            objectPath,
            size: totalSize,
            contentType,
          });
        } catch (error) {
          console.error("[UPLOAD-V2]", error);

          return res.status(500).json({
            error: "Erreur pendant le transfert",
          });
        }
      });
    } catch (error) {
      console.error("[UPLOAD-V2]", error);

      return res.status(500).json({
        error: "Erreur serveur",
      });
    }
  }
);

export default router;
