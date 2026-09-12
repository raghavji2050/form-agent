export function validateHttpUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  if (!input || typeof input !== "string") {
    return { ok: false, error: "URL is required" };
  }
  const trimmed = input.trim();
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "URL must use http or https" };
    }
    return { ok: true, url: parsed.href };
  } catch {
    return { ok: false, error: "Invalid URL" };
  }
}
