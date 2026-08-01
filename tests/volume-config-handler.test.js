import test from "node:test";
import assert from "node:assert/strict";

import { onRequestGet, onRequestPost } from "../functions/api/volume-config.js";
import { VOLUME_CONFIG_KEY } from "../src/shared/volume-control-policy.js";

function createEnvRecorder(storedConfig = null) {
  const calls = [];

  return {
    calls,
    AUDIO_UPLOADS: {
      async get(key) {
        calls.push({ type: "get", key });
        return storedConfig
          ? { async json() { return storedConfig; } }
          : null;
      },
      async put(key, value, options) {
        calls.push({ type: "put", key, value, options });
      }
    }
  };
}

test("returns default volume config when no saved config exists", async () => {
  const env = createEnvRecorder();

  const response = await onRequestGet({ env });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.config.mode, "farther_louder");
  assert.equal(env.calls[0].key, VOLUME_CONFIG_KEY);
});

test("stores normalized developer volume config", async () => {
  const env = createEnvRecorder();
  const request = new Request("https://example.com/api/volume-config", {
    method: "POST",
    body: JSON.stringify({
      enabled: true,
      mode: "nearer_louder",
      minDistanceMm: "300",
      maxDistanceMm: "2500",
      minVolumePercent: "90",
      maxVolumePercent: "30",
      sensitivity: "8"
    })
  });

  const response = await onRequestPost({ request, env });
  const body = await response.json();
  const stored = JSON.parse(env.calls[0].value);

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(env.calls[0].key, VOLUME_CONFIG_KEY);
  assert.equal(stored.mode, "nearer_louder");
  assert.equal(stored.minVolumePercent, 30);
  assert.equal(stored.maxVolumePercent, 90);
  assert.equal(stored.sensitivity, 3);
  assert.equal(env.calls[0].options.httpMetadata.contentType, "application/json");
});
