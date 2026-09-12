import { describe, it, expect, afterEach } from "vitest";
import {
  getLogUrl,
  getRecordingPublicUrl,
  getRunPublicUrl,
  shouldRecordVideo,
} from "./artifacts.js";

describe("artifacts URLs", () => {
  it("builds public run URLs", () => {
    expect(getRunPublicUrl("abc-123", "after-fill.png")).toBe(
      "/runs/abc-123/after-fill.png"
    );
    expect(getLogUrl("abc-123")).toBe("/runs/abc-123/run.json");
    expect(getRecordingPublicUrl("abc-123")).toBe("/runs/abc-123/recording.webm");
  });
});

describe("shouldRecordVideo", () => {
  const prev = process.env.RECORD_VIDEO;

  afterEach(() => {
    if (prev === undefined) delete process.env.RECORD_VIDEO;
    else process.env.RECORD_VIDEO = prev;
  });

  it("is on unless RECORD_VIDEO=false", () => {
    delete process.env.RECORD_VIDEO;
    expect(shouldRecordVideo()).toBe(true);
    process.env.RECORD_VIDEO = "false";
    expect(shouldRecordVideo()).toBe(false);
  });
});
