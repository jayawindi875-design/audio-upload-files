import test from "node:test";
import assert from "node:assert/strict";

import { onRequestGet } from "../functions/api/volume-status.js";
import { VOLUME_STATUS_KEY } from "../src/shared/volume-control-policy.js";

function createEnvRecorder(storedStatus = null) {
  const calls = [];

  return {
    calls,
    AUDIO_UPLOADS: {
      async get(key) {
        calls.push({ type: "get", key });
        return storedStatus
          ? { async json() { return storedStatus; } }
          : null;
      }
    }
  };
}

test("returns empty volume status when raspberry pi has not reported yet", async () => {
  const env = createEnvRecorder();

  const response = await onRequestGet({ env });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status.active, false);
  assert.equal(body.status.volumePercent, null);
  assert.equal(env.calls[0].key, VOLUME_STATUS_KEY);
});

test("returns latest raspberry pi volume status", async () => {
  const env = createEnvRecorder({
    active: true,
    distanceMm: 1200,
    volumePercent: 87,
    mode: "farther_louder",
    updatedAt: 1785615000000
  });

  const response = await onRequestGet({ env });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status.active, true);
  assert.equal(body.status.distanceMm, 1200);
  assert.equal(body.status.volumePercent, 87);
});
