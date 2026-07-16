import test from "node:test";
import assert from "node:assert/strict";

import {
  ALLOWED_EXTENSIONS,
  MAX_DELAY_SECONDS,
  MAX_FILE_SIZE_BYTES,
  buildObjectKey,
  buildScheduledObjectKey,
  isAllowedAudioFile,
  isAllowedFileSize,
  normalizeDelaySeconds,
  parseScheduledPlayAt
} from "../src/shared/upload-policy.js";

test("accepts supported audio file extensions", () => {
  assert.equal(isAllowedAudioFile("demo.mp3"), true);
  assert.equal(isAllowedAudioFile("voice.m4a"), true);
  assert.equal(isAllowedAudioFile("sample.wav"), true);
  assert.equal(isAllowedAudioFile("recording.mp4"), true);
  assert.equal(isAllowedAudioFile("recording.webm"), true);
  assert.equal(isAllowedAudioFile("recording.ogg"), true);
});

test("rejects unsupported file extensions", () => {
  assert.equal(isAllowedAudioFile("notes.txt"), false);
  assert.equal(isAllowedAudioFile("archive.zip"), false);
  assert.equal(isAllowedAudioFile("image.png"), false);
});

test("accepts file sizes up to the configured limit", () => {
  assert.equal(isAllowedFileSize(MAX_FILE_SIZE_BYTES - 1), true);
  assert.equal(isAllowedFileSize(MAX_FILE_SIZE_BYTES), true);
});

test("rejects empty audio recordings", () => {
  assert.equal(isAllowedFileSize(0), false);
});

test("rejects file sizes over the configured limit", () => {
  assert.equal(isAllowedFileSize(MAX_FILE_SIZE_BYTES + 1), false);
});

test("builds a safe incoming object key", () => {
  const key = buildObjectKey("My Song (Demo)#1.mp3", 1720950000000);

  assert.match(key, /^incoming\/1720950000000-my-song-demo-1\.mp3$/);
});

test("exports the expected extension allowlist", () => {
  assert.deepEqual(ALLOWED_EXTENSIONS, [".mp3", ".m4a", ".wav", ".mp4", ".webm", ".ogg"]);
});

test("accepts immediate and arbitrary whole-second delays within seven days", () => {
  assert.equal(normalizeDelaySeconds("0"), 0);
  assert.equal(normalizeDelaySeconds("37"), 37);
  assert.equal(normalizeDelaySeconds(String(MAX_DELAY_SECONDS)), MAX_DELAY_SECONDS);
});

test("rejects missing, fractional, negative, and excessive delays", () => {
  assert.equal(normalizeDelaySeconds(""), null);
  assert.equal(normalizeDelaySeconds("1.5"), null);
  assert.equal(normalizeDelaySeconds("-1"), null);
  assert.equal(normalizeDelaySeconds(String(MAX_DELAY_SECONDS + 1)), null);
});

test("builds and parses a scheduled incoming object key", () => {
  const key = buildScheduledObjectKey("recording.webm", 1720950037000, 1720950000000);

  assert.equal(key, "incoming/1720950037000-1720950000000-recording.webm");
  assert.equal(parseScheduledPlayAt(key), 1720950037000);
});

test("does not treat legacy object keys as scheduled keys", () => {
  assert.equal(parseScheduledPlayAt("incoming/1720950000000-recording.webm"), null);
});
