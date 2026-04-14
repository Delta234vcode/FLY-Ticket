import fs from "node:fs";
import path from "node:path";

const UPLOAD_DIR = path.resolve(process.cwd(), "uploads", "layouts");

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export function uploadsRoot() {
  return UPLOAD_DIR;
}
