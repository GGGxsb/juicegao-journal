import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import path from "node:path";
import { getDatabaseAdapter } from "../../db/sqlite.mjs";

export type { DatabaseAdapter, DatabaseResult, DatabaseStatement } from "../../db/sqlite.mjs";

const imageContentTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const mediaKeyPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp|gif)$/;
const cacheControl = "public, max-age=31536000, immutable";

export interface StoredMedia {
  body: Uint8Array<ArrayBuffer>;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

function missingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function mediaPath(key: string) {
  const match = mediaKeyPattern.exec(key);
  if (!match) throw new Error("Invalid media key.");
  const dataDirectory = path.resolve(process.env.DATA_DIR || path.join(process.cwd(), "data"));
  await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
  const directory = path.join(await realpath(dataDirectory), "uploads");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const directoryInfo = await lstat(directory);
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error("The uploads path must be a regular directory.");
  const filePath = path.resolve(directory, key);
  if (path.dirname(filePath) !== directory) throw new Error("Invalid media path.");
  return { filePath, contentType: imageContentTypes[match[1]] };
}

export const filesystemStorage = {
  async put(key: string, body: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }) {
    const { filePath, contentType } = await mediaPath(key);
    if (options?.httpMetadata?.contentType && options.httpMetadata.contentType !== contentType) throw new Error("Media type does not match its file extension.");
    const file = await open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    try {
      await file.writeFile(new Uint8Array(body));
      await file.sync();
    } catch (error) {
      await file.close();
      await unlink(filePath).catch(() => {});
      throw error;
    }
    await file.close();
  },

  async get(key: string): Promise<StoredMedia | null> {
    const { filePath, contentType } = await mediaPath(key);
    let file;
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Media must be stored as a regular file.");
      file = await open(filePath, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    } catch (error) {
      if (missingFile(error)) return null;
      throw error;
    }
    try {
      const bytes = await file.readFile();
      const body = new Uint8Array(bytes);
      const httpEtag = `"${createHash("sha256").update(body).digest("hex")}"`;
      return {
        body,
        httpEtag,
        writeHttpMetadata(headers) {
          headers.set("Content-Type", contentType);
          headers.set("Content-Length", String(body.byteLength));
          headers.set("Cache-Control", cacheControl);
        },
      };
    } finally {
      await file.close();
    }
  },

  async delete(key: string) {
    const { filePath } = await mediaPath(key);
    try {
      const info = await lstat(filePath);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("Media must be stored as a regular file.");
      await unlink(filePath);
    } catch (error) {
      if (!missingFile(error)) throw error;
    }
  },
};

export const env = {
  get DB() {
    return getDatabaseAdapter();
  },
  BUCKET: filesystemStorage,
  ADMIN_SETUP_TOKEN_HASH: process.env.ADMIN_SETUP_TOKEN_HASH,
};
