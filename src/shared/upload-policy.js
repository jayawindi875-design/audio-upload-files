export const ALLOWED_EXTENSIONS = [".mp3", ".m4a", ".wav", ".mp4", ".webm", ".ogg"];
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
export const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

const RECORDER_EXTENSION_BY_MIME = {
  "audio/mp4": ".mp4",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".m4a",
  "audio/webm": ".webm",
  "audio/webm;codecs=opus": ".webm",
  "audio/ogg": ".ogg",
  "audio/ogg;codecs=opus": ".ogg"
};

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
  return Number.isFinite(sizeInBytes) && sizeInBytes > 0 && sizeInBytes <= MAX_FILE_SIZE_BYTES;
}

export function buildObjectKey(fileName, timestamp = Date.now()) {
  const extension = normalizeExtension(fileName);
  const safeExtension = ALLOWED_EXTENSIONS.includes(extension) ? extension : ".bin";
  const safeBaseName = slugifyBaseName(fileName);

  return `incoming/${timestamp}-${safeBaseName}${safeExtension}`;
}

export function normalizeDelaySeconds(value) {
  const normalized = String(value ?? "").trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const seconds = Number(normalized);
  return Number.isSafeInteger(seconds) && seconds <= MAX_DELAY_SECONDS ? seconds : null;
}

export function buildScheduledObjectKey(fileName, playAt, uploadTimestamp = Date.now()) {
  const extension = normalizeExtension(fileName);
  const safeExtension = ALLOWED_EXTENSIONS.includes(extension) ? extension : ".bin";
  const safeBaseName = slugifyBaseName(fileName);

  return `incoming/${playAt}-${uploadTimestamp}-${safeBaseName}${safeExtension}`;
}

export function parseScheduledPlayAt(key) {
  const match = /^incoming\/(\d{13})-\d{13}-.+/.exec(String(key || ""));
  return match ? Number(match[1]) : null;
}

export function extensionFromRecorderMimeType(mimeType) {
  return RECORDER_EXTENSION_BY_MIME[String(mimeType || "").toLowerCase()] || ".webm";
}
