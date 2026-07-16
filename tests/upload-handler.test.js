import test from "node:test";
import assert from "node:assert/strict";

import { onRequestPost } from "../functions/api/upload.js";

function createRequestWithFile(file, delaySeconds = "0") {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("delaySeconds", delaySeconds);

  return new Request("https://example.com/api/upload", {
    method: "POST",
    body: formData
  });
}

function createEnvRecorder() {
  const calls = [];

  return {
    calls,
    AUDIO_UPLOADS: {
      async put(key, value, options) {
        calls.push({ key, value, options });
      }
    }
  };
}

test("rejects missing files", async () => {
  const request = new Request("https://example.com/api/upload", {
    method: "POST",
    body: new FormData()
  });

  const response = await onRequestPost({
    request,
    env: createEnvRecorder()
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "NO_FILE"
  });
});

test("returns a config error when storage binding is missing", async () => {
  const file = new File(["music-data"], "demo.mp3", { type: "audio/mpeg" });

  const response = await onRequestPost({
    request: createRequestWithFile(file),
    env: {}
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "STORAGE_NOT_CONFIGURED"
  });
});

test("rejects unsupported audio types", async () => {
  const env = createEnvRecorder();
  const file = new File(["hello"], "notes.txt", { type: "text/plain" });

  const response = await onRequestPost({
    request: createRequestWithFile(file),
    env
  });

  assert.equal(response.status, 415);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "UNSUPPORTED_TYPE"
  });
});

test("rejects files over the size limit", async () => {
  const env = createEnvRecorder();
  const file = new File([new Uint8Array(50 * 1024 * 1024 + 1)], "large.mp3", {
    type: "audio/mpeg"
  });

  const response = await onRequestPost({
    request: createRequestWithFile(file),
    env
  });

  assert.equal(response.status, 413);
  assert.equal(env.calls.length, 0);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "FILE_TOO_LARGE"
  });
});

test("stores accepted audio files in the incoming prefix", async () => {
  const env = createEnvRecorder();
  const file = new File(["music-data"], "My Song.mp3", { type: "audio/mpeg" });

  const response = await onRequestPost({
    request: createRequestWithFile(file),
    env
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.key, /^incoming\/\d{13}-\d{13}-my-song\.mp3$/);
  assert.equal(body.delaySeconds, 0);
  assert.equal(body.playAt, Number(body.key.split("/")[1].split("-")[0]));
  assert.equal(env.calls.length, 1);
  assert.equal(env.calls[0].key, body.key);
  assert.equal(env.calls[0].options.httpMetadata.contentType, "audio/mpeg");
});

test("stores recorded webm uploads", async () => {
  const env = createEnvRecorder();
  const file = new File(["recorded-data"], "recording.webm", { type: "audio/webm" });

  const response = await onRequestPost({
    request: createRequestWithFile(file),
    env
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.match(body.key, /^incoming\/\d{13}-\d{13}-recording\.webm$/);
  assert.equal(env.calls[0].options.httpMetadata.contentType, "audio/webm");
});

test("schedules playback using server time and an arbitrary whole-second delay", async () => {
  const env = createEnvRecorder();
  const file = new File(["recorded-data"], "recording.webm", { type: "audio/webm" });
  const before = Date.now();

  const response = await onRequestPost({
    request: createRequestWithFile(file, "37"),
    env
  });

  const after = Date.now();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.delaySeconds, 37);
  assert.ok(body.playAt >= before + 37_000);
  assert.ok(body.playAt <= after + 37_000);
  assert.match(body.key, new RegExp(`^incoming/${body.playAt}-\\d{13}-recording\\.webm$`));
});

test("rejects missing or invalid playback delays", async () => {
  for (const delaySeconds of ["", "-1", "1.5", "604801"]) {
    const env = createEnvRecorder();
    const file = new File(["recorded-data"], "recording.webm", { type: "audio/webm" });

    const response = await onRequestPost({
      request: createRequestWithFile(file, delaySeconds),
      env
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { ok: false, error: "INVALID_DELAY" });
    assert.equal(env.calls.length, 0);
  }
});
