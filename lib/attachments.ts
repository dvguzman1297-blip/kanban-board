export const BUCKET = "card-attachments";
export const MAX_BYTES = 10 * 1024 * 1024;     // keep in sync with the bucket limit in SQL
export const SIGNED_URL_TTL = 60 * 60 * 24;    // signed links last 24 h

export const isImage = (mime?: string | null) => !!mime && mime.startsWith("image/");

export const safeName = (name: string) => name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
