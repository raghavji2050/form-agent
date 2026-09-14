import { describe, expect, it, afterEach } from "vitest";
import {
  buildContextOptions,
  buildLaunchOptions,
  getBrowserChannel,
  isStealthEnabled,
} from "./stealth.js";

describe("stealth", () => {
  const prev: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const key of Object.keys(prev)) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  });

  function saveEnv(key: string, value: string | undefined) {
    if (!(key in prev)) prev[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  it("is enabled unless STEALTH=false", () => {
    saveEnv("STEALTH", undefined);
    expect(isStealthEnabled()).toBe(true);
    saveEnv("STEALTH", "false");
    expect(isStealthEnabled()).toBe(false);
  });

  it("adds anti-automation launch args when stealth is on", () => {
    saveEnv("STEALTH", undefined);
    saveEnv("BROWSER_CHANNEL", "none");
    const opts = buildLaunchOptions(true);
    expect(opts.ignoreDefaultArgs).toContain("--enable-automation");
    expect(opts.args).toContain("--disable-blink-features=AutomationControlled");
  });

  it("defaults browser channel to chrome when stealth is on", () => {
    saveEnv("STEALTH", undefined);
    saveEnv("BROWSER_CHANNEL", undefined);
    expect(getBrowserChannel()).toBe("chrome");
  });

  it("sets realistic context defaults when stealth is on", () => {
    saveEnv("STEALTH", undefined);
    const ctx = buildContextOptions({ width: 1280, height: 720 });
    expect(ctx.userAgent).toContain("Chrome");
    expect(ctx.locale).toBe("en-US");
    expect(ctx.timezoneId).toBe("America/New_York");
  });
});
