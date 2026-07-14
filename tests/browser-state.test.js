import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFileSize,
  getClientValidationError,
  getErrorMessage,
  getStatusContent,
  getToggleLabel,
  getUiCopy
} from "../src/shared/browser-state.js";

test("formats bytes into readable megabytes", () => {
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
});

test("returns a validation message when no file is selected", () => {
  assert.equal(getClientValidationError(null), "请先选择一个音频文件。");
});

test("returns an English validation message when no file is selected", () => {
  assert.equal(getClientValidationError(null, "en"), "Please choose an audio file first.");
});

test("returns a validation message for unsupported file extensions", () => {
  assert.equal(
    getClientValidationError({ name: "demo.txt", size: 128 }),
    "仅支持上传 MP3、M4A 或 WAV 文件。"
  );
});

test("returns a validation message for oversized files", () => {
  assert.equal(
    getClientValidationError({ name: "demo.mp3", size: 60 * 1024 * 1024 }),
    "文件不能超过 50 MB。"
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
    detail: "歌曲已进入云端队列，播放端稍后即可获取。"
  });
});

test("maps success status into English copy", () => {
  assert.deepEqual(getStatusContent("success", "", "en"), {
    tone: "success",
    title: "Upload complete",
    detail: "The song is now in the cloud queue and can be picked up by the player shortly."
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

test("returns English UI copy for the upload section", () => {
  assert.deepEqual(getUiCopy("en").stage, {
    title: "Audio Upload",
    description: "Supports MP3, M4A and WAV files, up to 50 MB each.",
    pickerLabel: "Choose an audio file",
    pickerHint: "Pick a song from your phone or computer",
    submit: "Upload to cloud",
    submitting: "Uploading..."
  });
});
