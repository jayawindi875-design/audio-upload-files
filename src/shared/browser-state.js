import {
  isAllowedAudioFile,
  isAllowedFileSize,
  MAX_FILE_SIZE_BYTES
} from "./upload-policy.js";

const MB_LIMIT = Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024);

const UI_COPY = {
  zh: {
    eyebrow: "INSTALLATION AUDIO PORTAL",
    heroTitle: "上传一首歌，让装置替你发声。",
    heroIntro: "打开这个页面，选择手机里的音频文件，即可把歌曲提交到云端播放队列。",
    stage: {
      title: "音频上传",
      description: `支持 MP3、M4A、WAV，单个文件不超过 ${MB_LIMIT} MB。`,
      pickerLabel: "选择音频文件",
      pickerHint: "从手机或电脑中选择一首歌",
      submit: "上传到云端",
      submitting: "上传中..."
    },
    status: {
      idleTitle: "准备上传",
      idleDetail: "选择一首歌曲后即可提交到云端。",
      readyDetail: "文件已就绪，点击下方按钮即可开始上传。",
      successTitle: "上传成功",
      successDetail: "歌曲已进入云端队列，播放端稍后即可获取。",
      uploadingTitle: "正在上传",
      uploadingDetail: "请保持页面开启，上传完成后会自动提示。",
      errorTitle: "上传失败",
      genericError: "请稍后重试。"
    },
    errors: {
      noFile: "请先选择一个音频文件。",
      unsupportedType: "仅支持上传 MP3、M4A 或 WAV 文件。",
      fileTooLarge: `文件不能超过 ${MB_LIMIT} MB。`,
      requestFailed: "上传请求未完成，请稍后重试。",
      networkError: "网络连接异常，请稍后重试。",
      storageNotConfigured: "云端存储尚未配置完成，请检查 Cloudflare R2 绑定。",
      unknown: "出现了未预期的问题，请稍后再试。"
    }
  },
  en: {
    eyebrow: "INSTALLATION AUDIO PORTAL",
    heroTitle: "Upload a song and let the installation speak for you.",
    heroIntro: "Open this page, choose an audio file from your phone, and send it to the cloud playback queue.",
    stage: {
      title: "Audio Upload",
      description: `Supports MP3, M4A and WAV files, up to ${MB_LIMIT} MB each.`,
      pickerLabel: "Choose an audio file",
      pickerHint: "Pick a song from your phone or computer",
      submit: "Upload to cloud",
      submitting: "Uploading..."
    },
    status: {
      idleTitle: "Ready to upload",
      idleDetail: "Choose a song and send it to the cloud queue.",
      readyDetail: "Your file is ready. Tap the button below to start uploading.",
      successTitle: "Upload complete",
      successDetail: "The song is now in the cloud queue and can be picked up by the player shortly.",
      uploadingTitle: "Uploading now",
      uploadingDetail: "Please keep this page open until the upload finishes.",
      errorTitle: "Upload failed",
      genericError: "Please try again in a moment."
    },
    errors: {
      noFile: "Please choose an audio file first.",
      unsupportedType: "Only MP3, M4A and WAV files are supported.",
      fileTooLarge: `Files must be smaller than ${MB_LIMIT} MB.`,
      requestFailed: "The upload request did not complete. Please try again shortly.",
      networkError: "The network connection was interrupted. Please try again.",
      storageNotConfigured: "Storage is not configured yet. Please check the Cloudflare R2 binding.",
      unknown: "Something unexpected happened. Please try again."
    }
  }
};

function normalizeLanguage(language) {
  return language === "en" ? "en" : "zh";
}

export function getUiCopy(language = "zh") {
  return UI_COPY[normalizeLanguage(language)];
}

export function getToggleLabel(language = "zh") {
  return normalizeLanguage(language) === "zh" ? "EN" : "中文";
}

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

export function getClientValidationError(file, language = "zh") {
  const copy = getUiCopy(language);

  if (!file) {
    return copy.errors.noFile;
  }

  if (!isAllowedAudioFile(file.name)) {
    return copy.errors.unsupportedType;
  }

  if (!isAllowedFileSize(file.size)) {
    return copy.errors.fileTooLarge;
  }

  return "";
}

export function getErrorMessage(errorCode, language = "zh") {
  const copy = getUiCopy(language);
  const normalizedCode = String(errorCode || "").trim();

  if (normalizedCode === "STORAGE_NOT_CONFIGURED") {
    return copy.errors.storageNotConfigured;
  }

  if (normalizedCode === "UNSUPPORTED_TYPE") {
    return copy.errors.unsupportedType;
  }

  if (normalizedCode === "FILE_TOO_LARGE") {
    return copy.errors.fileTooLarge;
  }

  if (normalizedCode === "NO_FILE") {
    return copy.errors.noFile;
  }

  if (normalizedCode) {
    return normalizedCode;
  }

  return copy.errors.unknown;
}

export function getStatusContent(status, detail = "", language = "zh") {
  const copy = getUiCopy(language);

  if (status === "success") {
    return {
      tone: "success",
      title: copy.status.successTitle,
      detail: copy.status.successDetail
    };
  }

  if (status === "uploading") {
    return {
      tone: "uploading",
      title: copy.status.uploadingTitle,
      detail: detail || copy.status.uploadingDetail
    };
  }

  if (status === "error") {
    return {
      tone: "error",
      title: copy.status.errorTitle,
      detail: detail || copy.status.genericError
    };
  }

  return {
    tone: "idle",
    title: copy.status.idleTitle,
    detail: detail || copy.status.idleDetail
  };
}
