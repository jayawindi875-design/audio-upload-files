import test from "node:test";
import assert from "node:assert/strict";

import {
  canStartRecording,
  formatFileSize,
  getClientValidationError,
  getErrorMessage,
  getStatusContent,
  getToggleLabel,
  getUiCopy,
  resolvePlaybackDelaySeconds
} from "../src/shared/browser-state.js";

test("formats bytes into readable megabytes", () => {
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
});

test("returns a validation message when no file is selected", () => {
  assert.equal(getClientValidationError(null), "请先完成一段录音。");
});

test("returns an English validation message when no file is selected", () => {
  assert.equal(getClientValidationError(null, "en"), "Please finish a recording first.");
});

test("returns a validation message for unsupported file extensions", () => {
  assert.equal(
    getClientValidationError({ name: "demo.txt", size: 128 }),
    "当前录音格式不受支持，请换一个浏览器重试。"
  );
});

test("returns a validation message for oversized files", () => {
  assert.equal(
    getClientValidationError({ name: "demo.mp3", size: 60 * 1024 * 1024 }),
    "录音不能超过 50 MB。"
  );
});

test("accepts valid audio files", () => {
  assert.equal(
    getClientValidationError({ name: "demo.mp3", size: 1024 }),
    ""
  );
});

test("maps success status into user-facing copy", () => {
  assert.deepEqual(getStatusContent("success"), {
    tone: "success",
    title: "上传成功",
    detail: "录音已进入云端队列，将按照你选择的时间播放。"
  });
});

test("maps success status into English copy", () => {
  assert.deepEqual(getStatusContent("success", "", "en"), {
    tone: "success",
    title: "Upload complete",
    detail: "Your recording is queued and will play at the time you selected."
  });
});

test("maps error status into user-facing copy", () => {
  assert.deepEqual(getStatusContent("error", "网络中断"), {
    tone: "error",
    title: "上传失败",
    detail: "网络中断"
  });
});

test("maps server error codes into readable English copy", () => {
  assert.equal(
    getErrorMessage("STORAGE_NOT_CONFIGURED", "en"),
    "Storage is not configured yet. Please check the Cloudflare R2 binding."
  );
});

test("returns the expected Chinese and English toggle labels", () => {
  assert.equal(getToggleLabel("zh"), "EN");
  assert.equal(getToggleLabel("en"), "中文");
});

test("returns recording-only hero copy", () => {
  assert.equal(getUiCopy("zh").heroTitle, "录下你的声音，让装置替你发声。");
  assert.equal(getUiCopy("en").heroTitle, "Record your voice and let the installation speak.");
});

test("returns English UI copy for the recorder section", () => {
  const copy = getUiCopy("en");

  assert.equal(copy.recorder.title, "Record your voice");
  assert.equal(copy.recorder.upload, "Upload recording");
  assert.equal(copy.playback.immediate, "Play immediately");
  assert.equal(copy.playback.delayed, "Play after a delay");
  assert.equal(copy.playback.delayLabel, "Delay time");
});

test("resolves immediate and delayed playback choices", () => {
  assert.equal(resolvePlaybackDelaySeconds("immediate", ""), 0);
  assert.equal(resolvePlaybackDelaySeconds("delayed", "37"), 37);
  assert.equal(resolvePlaybackDelaySeconds("delayed", "0"), null);
  assert.equal(resolvePlaybackDelaySeconds("delayed", "1.5"), null);
});

test("maps invalid delay responses into readable copy", () => {
  assert.equal(getErrorMessage("INVALID_DELAY", "zh"), "延迟时间必须是 1 到 604800 之间的整数秒。");
  assert.equal(
    getErrorMessage("INVALID_DELAY", "en"),
    "Delay must be a whole number from 1 to 604800 seconds."
  );
});

test("prevents recording startup while permission, recording, or upload is active", () => {
  assert.equal(canStartRecording({ isRequesting: false, isRecording: false, isUploading: false }), true);
  assert.equal(canStartRecording({ isRequesting: true, isRecording: false, isUploading: false }), false);
  assert.equal(canStartRecording({ isRequesting: false, isRecording: true, isUploading: false }), false);
  assert.equal(canStartRecording({ isRequesting: false, isRecording: false, isUploading: true }), false);
});
