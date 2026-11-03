import { randomUUID } from "crypto";
import {
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
  type ObjectAclPolicy,
  ObjectPermission,
} from "./objectAcl";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

export class ObjectStorageService {
  private get url(): string {
    const value = process.env.SUPABASE_URL;
    if (!value) throw new Error("SUPABASE_URL manquante");
    return value.replace(/\/$/, "");
  }

  private get key(): string {
    const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!value) throw new Error("SUPABASE_SERVICE_ROLE_KEY manquante");
    return value;
  }

  private get bucket(): string {
    return process.env.SUPABASE_MEDIA_BUCKET || "indamora-media";
  }

  private objectUrl(path: string): string {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    return `${this.url}/storage/v1/object/${this.bucket}/${encoded}`;
  }

  private headers(extra: Record<string, string> = {}) {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const path = `uploads/${randomUUID()}`;
    const encoded = path.split("/").map(encodeURIComponent).join("/");

    const response = await fetch(
      `${this.url}/storage/v1/object/upload/sign/${this.bucket}/${encoded}`,
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ upsert: false }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `Supabase upload URL error: ${response.status} ${await response.text()}`
      );
    }

    const data = await response.json() as {
      signedURL?: string;
      signedUrl?: string;
      url?: string;
    };

    const signed = data.signedURL ?? data.signedUrl ?? data.url;

    if (!signed) {
      throw new Error("URL signée Supabase absente");
    }

    if (signed.startsWith("http")) return signed;

    if (signed.startsWith("/storage/v1/")) {
      return `${this.url}${signed}`;
    }

    return `${this.url}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;
  }

  normalizeObjectEntityPath(raw: string): string {
    if (raw.startsWith("/objects/")) return raw;

    const url = new URL(raw, this.url);
    const marker = `/object/upload/sign/${this.bucket}/`;
    const index = url.pathname.indexOf(marker);

    if (index === -1) {
      throw new Error("URL Supabase invalide");
    }

    const path = decodeURIComponent(
      url.pathname.slice(index + marker.length)
    );

    if (!path || path.split("/").includes("..")) {
      throw new Error("Chemin de fichier invalide");
    }

    return `/objects/${path}`;
  }

  async getObjectEntityFile(path: string): Promise<string> {
    if (
      !path.startsWith("/objects/") ||
      path.split("/").some(part => part === ".." || part === ".")
    ) {
      throw new ObjectNotFoundError();
    }

    return path.slice("/objects/".length);
  }

  async setAcl(
    path: string,
    policy: ObjectAclPolicy
  ): Promise<string> {
    const normalized = path.startsWith("/objects/")
      ? path.slice("/objects/".length)
      : path;

    await setObjectAclPolicy(normalized, policy);

    return `/objects/${normalized}`;
  }

  async canAccessObjectEntity(args: {
    userId?: string;
    objectFile: string;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId: args.userId,
      objectPath: args.objectFile,
      requestedPermission:
        args.requestedPermission ?? ObjectPermission.READ,
    });
  }

  async searchPublicObject(path: string): Promise<string | null> {
    const objectPath = path.replace(/^\/+/, "");
    const policy = await getObjectAclPolicy(objectPath);

    if (!policy || policy.visibility !== "public") {
      return null;
    }

    return objectPath;
  }

  async downloadObject(
    objectPath: string,
    rangeHeader?: string
  ): Promise<Response> {
    const headers: Record<string, string> = this.headers();

    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    const response = await fetch(this.objectUrl(objectPath), {
      method: "GET",
      headers,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Supabase download error: ${response.status}`);
    }

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  }
}
