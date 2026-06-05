import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import path from "path";
import type { Response } from "express";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const gcs = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as any,
  projectId: "",
});

function bucket() {
  const id = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!id) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID not set");
  return gcs.bucket(id);
}

export const GCS_PREFIX = "gcs:";

export async function uploadToGcs(
  buffer: Buffer,
  mimetype: string,
  originalName: string
): Promise<string> {
  const ext = path.extname(originalName).toLowerCase();
  const objectName = `uploads/${randomUUID()}${ext}`;
  const file = bucket().file(objectName);
  await file.save(buffer, { contentType: mimetype, resumable: false });
  return `${GCS_PREFIX}${objectName}`;
}

export async function streamFromGcs(
  storedName: string,
  res: Response,
  disposition: "inline" | "attachment",
  originalName: string,
  mimetype: string
): Promise<void> {
  const objectName = storedName.slice(GCS_PREFIX.length);
  const file = bucket().file(objectName);
  const [exists] = await file.exists();
  if (!exists) {
    res.status(404).json({ error: "File missing from storage" });
    return;
  }
  res.setHeader("Content-Disposition", `${disposition}; filename="${originalName}"`);
  res.setHeader("Content-Type", mimetype);
  file.createReadStream().pipe(res);
}

export async function deleteFromGcs(storedName: string): Promise<void> {
  const objectName = storedName.slice(GCS_PREFIX.length);
  const file = bucket().file(objectName);
  const [exists] = await file.exists();
  if (exists) await file.delete();
}

export async function migrateFileToGcs(
  buffer: Buffer,
  mimetype: string,
  storedName: string
): Promise<string> {
  const objectName = `uploads/${storedName}`;
  const file = bucket().file(objectName);
  await file.save(buffer, { contentType: mimetype, resumable: false });
  return `${GCS_PREFIX}${objectName}`;
}
