/**
 * Fetch an image from a URL and return as a data URL (base64).
 * Used to pre-fetch broker logos so they can be served from our API.
 */

const MAX_BYTES = 512 * 1024; // 512KB

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "image/*,*/*",
        "User-Agent": BROWSER_USER_AGENT,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;

    const rawContentType = res.headers.get("content-type") ?? "";
    const contentType = rawContentType.split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES || buffer.byteLength === 0) return null;
    const base64 = Buffer.from(buffer).toString("base64");
    const mime = contentType || "image/png";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}
