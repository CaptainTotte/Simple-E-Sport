import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const imageExtByMime = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

export function validateUploadImage(file: File): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = imageExtByMime.get(file.type);
  if (!ext) {
    return { ok: false, error: "Only JPG, PNG and WEBP images are allowed." };
  }

  if (file.size <= 0) {
    return { ok: false, error: "File is empty." };
  }

  if (file.size > IMAGE_MAX_BYTES) {
    return { ok: false, error: "Image is too large. Max size is 5 MB." };
  }

  return { ok: true, ext };
}

export async function saveUploadImage(file: File, folder: "profiles" | "teams" | "proofs", ext: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await fs.mkdir(uploadDir, { recursive: true });

  const filename = `${Date.now()}-${randomUUID()}.${ext}`;
  const fullPath = path.join(uploadDir, filename);

  const arrayBuffer = await file.arrayBuffer();
  await fs.writeFile(fullPath, Buffer.from(arrayBuffer));

  return `/uploads/${folder}/${filename}`;
}

export async function deleteLocalUpload(publicUrl: string | null | undefined): Promise<void> {
  if (!publicUrl || !publicUrl.startsWith("/uploads/") || publicUrl.includes("..")) {
    return;
  }

  const normalized = publicUrl.replace(/^\/+/, "");
  const fullPath = path.join(process.cwd(), "public", normalized);

  try {
    await fs.unlink(fullPath);
  } catch {
    // Ignore missing/locked file issues.
  }
}
