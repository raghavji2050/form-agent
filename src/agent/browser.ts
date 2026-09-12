import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { ensureRunDir, getRunDir, shouldRecordVideo } from "./artifacts.js";

export { saveScreenshot } from "./artifacts.js";

function envMs(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getNavigationTimeout(): number {
  return envMs("NAVIGATION_TIMEOUT_MS", 30000);
}

export function getActionTimeout(): number {
  return envMs("ACTION_TIMEOUT_MS", 10000);
}

export function getSubmissionTimeout(): number {
  return envMs("SUBMISSION_TIMEOUT_MS", 15000);
}

export function getAgentTimeout(): number {
  return envMs("AGENT_TIMEOUT_MS", 120000);
}

export async function launchBrowser(): Promise<Browser> {
  const headless = process.env.HEADLESS !== "false";
  return chromium.launch({ headless });
}

export interface BrowserSession {
  page: Page;
  context: BrowserContext;
}

export async function createBrowserSession(
  browser: Browser,
  runId: string
): Promise<BrowserSession> {
  ensureRunDir(runId);
  const viewport = { width: 1280, height: 720 };
  const context = await browser.newContext({
    viewport,
    ...(shouldRecordVideo()
      ? { recordVideo: { dir: getRunDir(runId), size: viewport } }
      : {}),
  });
  const page = await context.newPage();
  page.setDefaultTimeout(getActionTimeout());
  page.setDefaultNavigationTimeout(getNavigationTimeout());
  return { page, context };
}

/** @deprecated Use createBrowserSession for per-run video recording */
export async function createPage(browser: Browser): Promise<Page> {
  const { page } = await createBrowserSession(browser, "legacy-no-video");
  return page;
}

export async function gotoPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: getNavigationTimeout() });
  try {
    await page.waitForLoadState("networkidle", { timeout: 5000 });
  } catch {
    /* optional */
  }
}

export async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close();
}
