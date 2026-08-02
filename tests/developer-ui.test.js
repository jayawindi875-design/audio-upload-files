import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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

test("keeps the live volume debug readout inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const readout = html.indexOf('id="volume-debug-current"');

  assert.ok(panelStart >= 0);
  assert.ok(readout > panelStart);
});

test("keeps radar selection controls inside the developer panel", () => {
  const panelStart = html.indexOf('id="developer-panel"');
  const angleCenter = html.indexOf('id="angle-center-degrees"');
  const angleWidth = html.indexOf('id="angle-width-degrees"');
  const percentile = html.indexOf('id="distance-percentile"');

  assert.ok(panelStart >= 0);
  assert.ok(angleCenter > panelStart);
  assert.ok(angleWidth > panelStart);
  assert.ok(percentile > panelStart);
});
