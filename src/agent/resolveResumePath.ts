import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..", "..");

export function resolveResumePath(candidatePath: string | null): string | null {
  const fromEnv = process.env.RESUME_PATH?.trim();
  const raw = fromEnv || candidatePath;
  if (!raw) return null;

  const absolute = path.isAbsolute(raw) ? raw : path.join(PROJECT_ROOT, raw);
  if (!fs.existsSync(absolute)) {
    return null;
  }
  return absolute;
}
