import assert from "node:assert/strict";
import test from "node:test";

import { onRequestPost } from "../functions/api/livekit-token.js";

function decodeJwtPayload(token) {
  const payload = token.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

test("mints a short-lived microphone-publisher token for the fixed device room", async () => {
  const before = Math.floor(Date.now() / 1000);
  const response = await onRequestPost({
    request: new Request("https://example.com/api/livekit-token", { method: "POST" }),
    env: {
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret"
    }
  });

  assert.equal(response.status, 200);
  const body = await response.json();
  const claims = decodeJwtPayload(body.token);

  assert.equal(body.url, "wss://example.livekit.cloud");
  assert.equal(body.room, "device-raspberry-001");
  assert.match(body.identity, /^web-/);
  assert.equal(claims.iss, "test-key");
  assert.equal(claims.sub, body.identity);
  assert.equal(claims.video.room, "device-raspberry-001");
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canPublishData, true);
  assert.equal(claims.video.canSubscribe, false);
  assert.deepEqual(claims.video.canPublishSources, ["microphone"]);
  assert.ok(claims.exp > before);
  assert.ok(claims.exp <= before + 10 * 60 + 1);
});

test("does not mint a token when a LiveKit secret is unavailable", async () => {
  const response = await onRequestPost({
    request: new Request("https://example.com/api/livekit-token", { method: "POST" }),
    env: {
      LIVEKIT_URL: "wss://example.livekit.cloud",
      LIVEKIT_API_KEY: "test-key"
    }
  });

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), {
    ok: false,
    error: "LIVEKIT_NOT_CONFIGURED"
  });
});
