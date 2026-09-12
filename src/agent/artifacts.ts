import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { BrowserContext, Page } from "playwright";
import type { LogEntry } from "./runLogger.js";
import type { RunResult } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUNS_ROOT = path.join(__dirname, "..", "..", "runs");

export function getRunDir(runId: string): string {
  return path.join(RUNS_ROOT, runId);
}

export function getRunPublicUrl(runId: string, filename: string): string {
  return `/runs/${runId}/${filename}`;
}

export function getLogUrl(runId: string): string {
  return getRunPublicUrl(runId, "run.json");
}

export function getRecordingPublicUrl(runId: string): string {
  return getRunPublicUrl(runId, "recording.webm");
}

/** On by default; set RECORD_VIDEO=false to disable. */
export function shouldRecordVideo(): boolean {
  return process.env.RECORD_VIDEO !== "false";
}

export function ensureRunDir(runId: string): string {
  const dir = getRunDir(runId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export async function saveScreenshot(
  page: Page,
  runId: string,
  name: string
): Promise<string> {
  ensureRunDir(runId);
  const filename = `${name}.png`;
  const filePath = path.join(getRunDir(runId), filename);
  await page.screenshot({ path: filePath, fullPage: true });
  return getRunPublicUrl(runId, filename);
}

export async function finalizeRunRecording(
  page: Page,
  context: BrowserContext,
  runId: string
): Promise<string | undefined> {
  const video = shouldRecordVideo() ? page.video() : null;
  await context.close();
  if (!video) return undefined;
  ensureRunDir(runId);
  const dest = path.join(getRunDir(runId), "recording.webm");
  await video.saveAs(dest);
  return getRecordingPublicUrl(runId);
}

export interface RunJsonPayload extends RunResult {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  logs: LogEntry[];
}

export function writeRunJson(runId: string, payload: RunJsonPayload): void {
  ensureRunDir(runId);
  const filePath = path.join(getRunDir(runId), "run.json");
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}
