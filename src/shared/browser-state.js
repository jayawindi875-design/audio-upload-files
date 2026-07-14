import {
  isAllowedAudioFile,
  isAllowedFileSize,
  MAX_FILE_SIZE_BYTES
} from "./upload-policy.js";

export function formatFileSize(sizeInBytes) {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes < 0) {
    return "0 B";
  }

  if (sizeInBytes < 1024) {
    return `${sizeInBytes} B`;
  }

  if (sizeInBytes < 1024 * 1024) {
    return `${(sizeInBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeInBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getClientValidationError(file) {
  if (!file) {
    return "请先选择一个音频文件。";
  }

  if (!isAllowedAudioFile(file.name)) {
    return "仅支持上传 MP3、M4A 或 WAV 文件。";
  }

  if (!isAllowedFileSize(file.size)) {
    return `文件不能超过 ${Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024)} MB。`;
  }

  return "";
}

export function getStatusContent(status, detail = "") {
  if (status === "success") {
    return {
      tone: "success",
      title: "上传成功",
      detail: "歌曲已进入云端队列，播放端稍后即可获取。"
    };
  }

  if (status === "uploading") {
    return {
      tone: "uploading",
      title: "正在上传",
      detail: detail || "请保持页面开启，上传完成后会自动提示。"
    };
  }

  if (status === "error") {
    return {
      tone: "error",
      title: "上传失败",
      detail: detail || "请稍后重试。"
    };
  }

  return {
    tone: "idle",
    title: "准备上传",
    detail: detail || "选择一首歌曲后即可提交到云端。"
  };
}
