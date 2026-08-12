import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("keeps developer controls behind a non-obvious trigger", () => {
  assert.doesNotMatch(html, />Developer<\/button>/);
  assert.match(html, /id="developer-toggle"/);
  assert.match(html, /aria-label="Open developer controls"/);
});

test("keeps the test song uploader inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const uploadInput = html.indexOf('id="test-song-file"');
  const uploadButton = html.indexOf('id="test-song-upload"');

  assert.ok(panelStart >= 0);
  assert.ok(uploadInput > panelStart);
  assert.ok(uploadButton > panelStart);
});

test("shows live call controls as the primary interface", () => {
  assert.match(html, /id="call-start-button"/);
  assert.match(html, /id="call-stop-button"/);
  assert.match(html, /id="call-stream-status"/);
  assert.match(html, /src="\/vendor\/livekit-client\.umd\.min\.js"/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/livekit-client/);
  assert.doesNotMatch(html, /id="call-chunks-sent"/);
  assert.doesNotMatch(html, /id="call-pending-uploads"/);
  assert.match(html, /name="call-playback-mode" value="immediate"/);
  assert.match(html, /name="call-playback-mode" value="delayed"/);
  assert.match(html, /id="call-delay-seconds"/);
});

test("starts the LiveKit call without the legacy recording chunk uploader", () => {
  const start = app.indexOf("async function startCall()");
  const end = app.indexOf("function stopCall()", start);
  const startCall = app.slice(start, end);

  assert.ok(start >= 0);
  assert.ok(end > start);
  assert.match(startCall, /publishTrack\(callStream\.getAudioTracks\(\)\[0\]\)/);
  assert.doesNotMatch(startCall, /startNextCallChunk|sessionMimeType|MediaRecorder/);
});

test("captures the microphone during the click before connecting to LiveKit", () => {
  const start = app.indexOf("async function startCall()");
  const end = app.indexOf("function stopCall()", start);
  const startCall = app.slice(start, end);

  assert.match(
    startCall,
    /await navigator\.mediaDevices\.getUserMedia\(\{ audio: true \}\)[\s\S]*await fetch\("\/api\/livekit-token"/
  );
  assert.match(startCall, /publishTrack\(callStream\.getAudioTracks\(\)\[0\]\)/);
});

test("keeps the legacy recorder uploader inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const recordStart = html.indexOf('id="record-start-button"');
  const playbackPanel = html.indexOf('class="playback-panel"');
  const uploadButton = html.indexOf('id="record-upload-button"');

  assert.ok(panelStart >= 0);
  assert.ok(recordStart > panelStart);
  assert.ok(playbackPanel > panelStart);
  assert.ok(uploadButton > panelStart);
});

test("keeps the live volume debug readout inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const readout = html.indexOf('id="volume-debug-current"');

  assert.ok(panelStart >= 0);
  assert.ok(readout > panelStart);
});

test("keeps radar selection controls inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const baselineRevolutions = html.indexOf('id="baseline-revolutions"');
  const baselineBin = html.indexOf('id="baseline-bin-degrees"');
  const threshold = html.indexOf('id="change-threshold-mm"');
  const stableHold = html.indexOf('id="stable-hold-seconds"');

  assert.ok(panelStart >= 0);
  assert.ok(baselineRevolutions > panelStart);
  assert.ok(baselineBin > panelStart);
  assert.ok(threshold > panelStart);
  assert.ok(stableHold > panelStart);
});
