import { randomUUID } from "crypto";
import { Readable } from "stream";
import { File, Storage } from "@google-cloud/storage";
import { canAccessObject, getObjectAclPolicy, ObjectAclPolicy, ObjectPermission, setObjectAclPolicy } from "./objectAcl";

const SIDECAR = "http://127.0.0.1:1106";
export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit", subject_token_type: "access_token", token_url: `${SIDECAR}/token`,
    type: "external_account", credential_source: { url: `${SIDECAR}/credential`, format: { type: "json", subject_token_field_name: "access_token" } },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() { super("Object not found"); this.name = "ObjectNotFoundError"; }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = (path.startsWith("/") ? path : `/${path}`).split("/");
  if (parts.length < 3 || !parts[1] || !parts.slice(2).join("/")) throw new Error("Invalid object path");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

export class ObjectStorageService {
  getPublicObjectSearchPaths(): string[] {
    const paths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    if (!paths.length) throw new Error("PUBLIC_OBJECT_SEARCH_PATHS is not configured");
    return [...new Set(paths)];
  }
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR ?? "";
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return dir;
  }
  async searchPublicObject(path: string): Promise<File | null> {
    for (const base of this.getPublicObjectSearchPaths()) {
      const { bucketName, objectName } = parseObjectPath(`${base}/${path}`);
      const file = objectStorageClient.bucket(bucketName).file(objectName);
      if ((await file.exists())[0]) return file;
    }
    return null;
  }
  async getObjectEntityUploadURL(): Promise<string> {
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/uploads/${randomUUID()}`);
    return this.signObjectURL(bucketName, objectName, "PUT", 900);
  }
  normalizeObjectEntityPath(raw: string): string {
    if (!raw.startsWith("https://storage.googleapis.com/")) return raw;
    const pathname = new URL(raw).pathname;
    const dir = `${this.getPrivateObjectDir().replace(/\/$/, "")}/`;
    return pathname.startsWith(dir) ? `/objects/${pathname.slice(dir.length)}` : pathname;
  }
  async getObjectEntityFile(path: string): Promise<File> {
    if (!path.startsWith("/objects/")) throw new ObjectNotFoundError();
    if (path.split("/").some((part) => part === ".." || part === ".")) throw new ObjectNotFoundError();
    const { bucketName, objectName } = parseObjectPath(`${this.getPrivateObjectDir()}/${path.slice("/objects/".length)}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    if (!(await file.exists())[0]) throw new ObjectNotFoundError();
    return file;
  }
  async setAcl(path: string, policy: ObjectAclPolicy): Promise<string> {
    const normalized = this.normalizeObjectEntityPath(path);
    await setObjectAclPolicy(await this.getObjectEntityFile(normalized), policy);
    return normalized;
  }
  async canAccessObjectEntity(args: { userId?: string; objectFile: File; requestedPermission?: ObjectPermission }) {
    return canAccessObject({ ...args, requestedPermission: args.requestedPermission ?? ObjectPermission.READ });
  }
  async downloadObject(file: File, rangeHeader?: string): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const publicObject = (await getObjectAclPolicy(file))?.visibility === "public";
    const size = Number(metadata.size ?? 0);
    const headers: Record<string, string> = {
      "Content-Type": String(metadata.contentType ?? "application/octet-stream"),
      "Cache-Control": `${publicObject ? "public" : "private"}, max-age=3600`,
      "Accept-Ranges": "bytes",
    };
    const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
    if (match && size > 0) {
      const requestedStart = match[1] ? Number(match[1]) : undefined;
      const requestedEnd = match[2] ? Number(match[2]) : undefined;
      const start = requestedStart ?? Math.max(0, size - (requestedEnd ?? 0));
      const end = Math.min(requestedEnd ?? size - 1, size - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end) {
        return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
      }
      headers["Content-Length"] = String(end - start + 1);
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      const body = Readable.toWeb(file.createReadStream({ start, end })) as ReadableStream;
      return new Response(body, { status: 206, headers });
    }
    const body = Readable.toWeb(file.createReadStream()) as ReadableStream;
    if (size > 0) headers["Content-Length"] = String(size);
    return new Response(body, { headers });
  }
  private async signObjectURL(bucketName: string, objectName: string, method: "PUT" | "GET", ttlSec: number) {
    const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket_name: bucketName, object_name: objectName, method, expires_at: new Date(Date.now() + ttlSec * 1000).toISOString() }),
    });
    if (!response.ok) throw new Error(`Failed to sign object URL (${response.status})`);
    return (await response.json() as { signed_url: string }).signed_url;
  }
}