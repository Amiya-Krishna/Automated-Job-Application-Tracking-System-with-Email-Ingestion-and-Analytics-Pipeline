// Only http(s) URLs are ever rendered as links. Stored values can come from
// scraped pages or the extension, so javascript:/data:/internal:// are dropped.
export function safeWebUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}
