export const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav"];
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

function normalizeExtension(fileName) {
  const normalized = String(fileName || "").trim().toLowerCase();
  const lastDotIndex = normalized.lastIndexOf(".");

  if (lastDotIndex < 0) {
    return "";
  }

  return normalized.slice(lastDotIndex);
}

function slugifyBaseName(fileName) {
  const normalized = String(fileName || "")
    .trim()
    .toLowerCase()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "audio";
}

export function isAllowedAudioFile(fileName) {
  return ALLOWED_EXTENSIONS.includes(normalizeExtension(fileName));
}

export function isAllowedFileSize(sizeInBytes) {
  return Number.isFinite(sizeInBytes) && sizeInBytes >= 0 && sizeInBytes <= MAX_FILE_SIZE_BYTES;
}

export function buildObjectKey(fileName, timestamp = Date.now()) {
  const extension = normalizeExtension(fileName);
  const safeExtension = ALLOWED_EXTENSIONS.includes(extension) ? extension : ".bin";
  const safeBaseName = slugifyBaseName(fileName);

  return `incoming/${timestamp}-${safeBaseName}${safeExtension}`;
}
