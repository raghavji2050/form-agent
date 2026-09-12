import { describe, it, expect } from "vitest";
import { validateHttpUrl } from "./validateUrl.js";

describe("validateHttpUrl", () => {
  it("accepts http and https", () => {
    expect(validateHttpUrl("https://example.com/form").ok).toBe(true);
    expect(validateHttpUrl("http://localhost:3000/test-form.html").ok).toBe(true);
  });

  it("rejects invalid and non-http protocols", () => {
    expect(validateHttpUrl("not-a-url").ok).toBe(false);
    expect(validateHttpUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateHttpUrl("ftp://files.example.com").ok).toBe(false);
  });
});
