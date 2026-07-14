import test from "node:test";
import assert from "node:assert/strict";

import {
  formatFileSize,
  getClientValidationError,
  getStatusContent
} from "../src/shared/browser-state.js";

test("formats bytes into readable megabytes", () => {
  assert.equal(formatFileSize(1024), "1.0 KB");
  assert.equal(formatFileSize(5 * 1024 * 1024), "5.0 MB");
});

test("returns a validation message when no file is selected", () => {
  assert.equal(getClientValidationError(null), "请先选择一个音频文件。");
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

test("maps error status into user-facing copy", () => {
  assert.deepEqual(getStatusContent("error", "网络中断"), {
    tone: "error",
    title: "上传失败",
    detail: "网络中断"
  });
});
