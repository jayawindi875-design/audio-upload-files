import assert from "node:assert/strict";
import test from "node:test";

import {
  LIVEKIT_ROOM,
  MAX_LIVE_DELAY_SECONDS,
  RASPBERRY_PI_IDENTITY,
  normalizeLiveDelaySeconds
} from "../src/shared/live-call-policy.js";

test("uses one stable LiveKit room and Raspberry Pi identity", () => {
  assert.equal(LIVEKIT_ROOM, "device-raspberry-001");
  assert.equal(RASPBERRY_PI_IDENTITY, "raspberry-001");
});

test("accepts whole live playback delays from zero through sixty seconds", () => {
  assert.equal(MAX_LIVE_DELAY_SECONDS, 60);
  assert.equal(normalizeLiveDelaySeconds("0"), 0);
  assert.equal(normalizeLiveDelaySeconds("10"), 10);
  assert.equal(normalizeLiveDelaySeconds(60), 60);
});

test("rejects fractional, negative, and over-limit live playback delays", () => {
  assert.equal(normalizeLiveDelaySeconds(""), null);
  assert.equal(normalizeLiveDelaySeconds("1.5"), null);
  assert.equal(normalizeLiveDelaySeconds("-1"), null);
  assert.equal(normalizeLiveDelaySeconds("61"), null);
});
