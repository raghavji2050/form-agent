import type { BrowserContextOptions, LaunchOptions } from "playwright";
import { applyStealth } from "./inBrowser/applyStealth.js";

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** On by default; set STEALTH=false to use stock Playwright fingerprint. */
export function isStealthEnabled(): boolean {
  return process.env.STEALTH !== "false";
}

export function getBrowserChannel(): "chrome" | "msedge" | undefined {
  const raw = process.env.BROWSER_CHANNEL?.trim().toLowerCase();
  if (raw === "none" || raw === "chromium") return undefined;
  if (raw === "chrome" || raw === "msedge") return raw;
  if (isStealthEnabled()) return "chrome";
  return undefined;
}

export function buildLaunchOptions(headless: boolean): LaunchOptions {
  const opts: LaunchOptions = { headless };

  if (!isStealthEnabled()) return opts;

  opts.ignoreDefaultArgs = ["--enable-automation"];
  opts.args = ["--disable-blink-features=AutomationControlled"];

  const channel = getBrowserChannel();
  if (channel) opts.channel = channel;

  return opts;
}

export function buildContextOptions(viewport: {
  width: number;
  height: number;
}): BrowserContextOptions {
  const opts: BrowserContextOptions = { viewport };

  if (!isStealthEnabled()) return opts;

  opts.userAgent = process.env.BROWSER_USER_AGENT || DEFAULT_USER_AGENT;
  opts.locale = process.env.BROWSER_LOCALE || "en-US";
  opts.timezoneId = process.env.BROWSER_TIMEZONE || "America/New_York";
  opts.colorScheme = "light";
  opts.deviceScaleFactor = 1;
  opts.hasTouch = false;
  opts.isMobile = false;
  opts.extraHTTPHeaders = {
    "Accept-Language": "en-US,en;q=0.9",
  };

  return opts;
}

export async function applyStealthToContext(
  addInitScript: (script: typeof applyStealth) => Promise<void>
): Promise<void> {
  if (!isStealthEnabled()) return;
  await addInitScript(applyStealth);
}
