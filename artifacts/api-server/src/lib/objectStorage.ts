import { randomUUID } from "node:crypto";
import {
  canAccessObject,
  getObjectAclPolicy,
  type ObjectAclPolicy,
  ObjectPermission,
  setObjectAclPolicy,
} from "./objectAcl";

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || "indamora-media";

  if (!url || !key) {
    throw new Error("Configuration Supabase manquante.");
  }

  return { url, key, bucket };
}

function getHeaders(extra: Record<string, string> = {}) {
  const { key } = getConfig();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra,
  };
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function validatePath(path: string) {
  if (
    !path ||
    path.startsWith("/") ||
    path.split("/").some(part =>
      !part || part === "." || part === ".."
    )
  ) {
    throw new Error("Chemin de fichier invalide.");
  }

  return path;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Fichier introuvable.");
    this.name = "ObjectNotFoundError";
  }
}

export class SupabaseFile {
  constructor(public readonly name: string) {
    validatePath(name);
  }

  private getObjectUrl() {
    const { url, bucket } = getConfig();

    return `${url}/storage/v1/object/${bucket}/${encodePath(this.name)}`;
  }

  async exists(): Promise<[boolean]> {
    const { url, bucket } = getConfig();

    const response = await fetch(
      `${url}/storage/v1/object/info/${bucket}/${encodePath(this.name)}`,
      { headers: getHeaders() }
    );

    if (response.status === 404 || response.status === 400) {
      return [false];
    }

    if (!response.ok) {
      throw new Error(`Erreur Supabase : ${response.status}`);
    }

    return [true];
  }

  async getMetadata(): Promise<[{
    size: string;
    contentType: string;
  }]> {
    const { url, bucket } = getConfig();

    const response = await fetch(
      `${url}/storage/v1/object/info/${bucket}/${encodePath(this.name)}`,
      { headers: getHeaders() }
    );

    if (response.status === 404) {
      throw new ObjectNotFoundError();
    }

    if (!response.ok) {
      throw new Error(`Erreur métadonnées : ${response.status}`);
    }

    const data = await response.json() as {
      metadata?: {
        size?: number;
        mimetype?: string;
      };
    };

    return [{
      size: String(data.metadata?.size ?? 0),
      contentType:
        data.metadata?.mimetype ?? "application/octet-stream",
    }];
  }

  async download(): Promise<[Buffer]> {
    const response = await fetch(this.getObjectUrl(), {
      headers: getHeaders(),
    });

    if (response.status === 404) {
      throw new ObjectNotFoundError();
    }

    if (!response.ok) {
      throw new Error(`Erreur téléchargement : ${response.status}`);
    }

    return [Buffer.from(await response.arrayBuffer())];
  }

  async save(
    bytes: Buffer,
    options?: {
      metadata?: { contentType?: string };
      resumable?: boolean;
    }
  ): Promise<void> {
    const response = await fetch(this.getObjectUrl(), {
      method: "POST",
      headers: getHeaders({
        "Content-Type":
          options?.metadata?.contentType ??
          "application/octet-stream",
        "x-upsert": "false",
      }),
      body: new Uint8Array(bytes),
    });

    if (!response.ok) {
      throw new Error(`Erreur enregistrement : ${response.status}`);
    }
  }

  async readResponse(range?: string): Promise<Response> {
    const response = await fetch(this.getObjectUrl(), {
      headers: getHeaders(range ? { Range: range } : {}),
    });

    if (response.status === 404) {
      throw new ObjectNotFoundError();
    }

    if (!response.ok && response.status !== 206) {
      throw new Error(`Erreur lecture : ${response.status}`);
    }

    return response;
  }
}

export const objectStorageClient = {
  bucket(_bucket: string) {
    return {
      file(name: string) {
        return new SupabaseFile(name);
      },
    };
  },
};

export class ObjectStorageService {
  getPrivateObjectDir() {
    return `/${getConfig().bucket}`;
  }

  getPublicObjectSearchPaths(): string[] {
    return (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
      .split(",")
      .map(path => path.trim())
      .filter(Boolean);
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const { url, bucket } = getConfig();
    const path = `uploads/${randomUUID()}`;

    const response = await fetch(
      `${url}/storage/v1/object/upload/sign/${bucket}/${encodePath(path)}`,
      {
        method: "POST",
        headers: getHeaders({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ upsert: false }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Impossible de créer l'URL d'envoi : ${response.status}`
      );
    }

    const data = await response.json() as {
      url?: string;
      signedURL?: string;
      signedUrl?: string;
    };

    const signedUrl =
      data.signedURL ?? data.signedUrl ?? data.url;

    if (!signedUrl) {
      throw new Error("URL Supabase manquante.");
    }

    return signedUrl.startsWith("http")
      ? signedUrl
      : `${url}${signedUrl}`;
  }

  normalizeObjectEntityPath(raw: string): string {
    if (raw.startsWith("/objects/")) {
      return raw;
    }

    const { url, bucket } = getConfig();
    const parsed = new URL(raw);

    if (parsed.origin !== new URL(url).origin) {
      throw new Error("URL de stockage invalide.");
    }

    const marker = `/object/upload/sign/${bucket}/`;
    const position = parsed.pathname.indexOf(marker);

    if (position < 0) {
      throw new Error("Chemin de stockage invalide.");
    }

    const path = decodeURIComponent(
      parsed.pathname.slice(position + marker.length)
    );

    return `/objects/${validatePath(path)}`;
  }

  async getObjectEntityFile(path: string): Promise<SupabaseFile> {
    if (!path.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const file = new SupabaseFile(path.slice(9));

    if (!(await file.exists())[0]) {
      throw new ObjectNotFoundError();
    }

    return file;
  }

  async searchPublicObject(path: string): Promise<SupabaseFile | null> {
    let normalized: string;

    try {
      normalized = validatePath(path.replace(/^\/+/, ""));
    } catch {
      return null;
    }

    const file = new SupabaseFile(normalized);

    try {
      if (!(await file.exists())[0]) {
        return null;
      }

      const policy = await getObjectAclPolicy(file);
      return policy?.visibility === "public" ? file : null;
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  async setAcl(
    path: string,
    policy: ObjectAclPolicy
  ): Promise<string> {
    const normalized = this.normalizeObjectEntityPath(path);
    const file = await this.getObjectEntityFile(normalized);

    await setObjectAclPolicy(file, policy);

    return normalized;
  }

  async canAccessObjectEntity(args: {
    userId?: string;
    objectFile: SupabaseFile;
    requestedPermission?: ObjectPermission;
  }) {
    return canAccessObject({
      ...args,
      requestedPermission:
        args.requestedPermission ?? ObjectPermission.READ,
    });
  }

  async downloadObject(
    file: SupabaseFile,
    rangeHeader?: string
  ): Promise<Response> {
    const response = await file.readResponse(rangeHeader);
    const policy = await getObjectAclPolicy(file);

    const headers = new Headers(response.headers);

    headers.set("Cache-Control",
      policy?.visibility === "public"
        ? "public, max-age=300"
        : "private, max-age=300"
    );

    return new Response(response.body, {
      status: response.status,
      headers,
    });
  }
}
