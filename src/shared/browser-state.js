import {
  isAllowedAudioFile,
  isAllowedFileSize,
  MAX_DELAY_SECONDS,
  MAX_FILE_SIZE_BYTES,
  normalizeDelaySeconds
} from "./upload-policy.js";

const MB_LIMIT = Math.round(MAX_FILE_SIZE_BYTES / 1024 / 1024);

const UI_COPY = {
  zh: {
    eyebrow: "INSTALLATION AUDIO PORTAL",
    heroTitle: "录下你的声音，让装置替你发声。",
    heroIntro: "打开麦克风录下一段声音，选择立即或延迟播放，再把录音发送到云端装置。",
    recorder: {
      title: "录制声音",
      description: `支持手机和电脑浏览器录音，单段录音不超过 ${MB_LIMIT} MB。`,
      start: "开始录音",
      stop: "停止录音",
      preview: "录音试听",
      upload: "上传录音",
      uploading: "上传中...",
      recording: "录音中..."
    },
    playback: {
      title: "选择播放时间",
      immediate: "立即播放",
      immediateHint: "上传完成后，装置会尽快播放",
      delayed: "延迟播放",
      delayedHint: "上传后等待指定秒数再播放",
      delayLabel: "延迟时间",
      delayUnit: "秒",
      delayedSummary: "录音将在上传后 {seconds} 秒进入播放。"
    },
    status: {
      idleTitle: "准备录音",
      idleDetail: "点击开始录音，并允许浏览器使用麦克风。",
      readyDetail: "录音已就绪，可以提交到云端。",
      recorderReadyDetail: "录音已完成，可以先试听，再上传到云端。",
      successTitle: "上传成功",
      successDetail: "录音已进入云端队列，将按照你选择的时间播放。",
      uploadingTitle: "正在上传",
      uploadingDetail: "请保持页面开启，上传完成后会自动提示。",
      errorTitle: "上传失败",
      genericError: "请稍后重试。"
    },
    errors: {
      noFile: "请先完成一段录音。",
      unsupportedType: "当前录音格式不受支持，请换一个浏览器重试。",
      fileTooLarge: `录音不能超过 ${MB_LIMIT} MB。`,
      requestFailed: "上传请求未完成，请稍后重试。",
      networkError: "网络连接异常，请稍后重试。",
      storageNotConfigured: "云端存储尚未配置完成，请检查 Cloudflare R2 绑定。",
      invalidDelay: `延迟时间必须是 1 到 ${MAX_DELAY_SECONDS} 之间的整数秒。`,
      recorderUnsupported: "当前浏览器不支持网页录音，请尝试使用最新版 Safari、Chrome 或 Edge。",
      microphoneDenied: "麦克风权限未开启，请允许浏览器访问麦克风后重试。",
      recorderEmpty: "请先完成一段录音，再上传。",
      unknown: "出现了未预期的问题，请稍后再试。"
    }
  },
  en: {
    eyebrow: "INSTALLATION AUDIO PORTAL",
    heroTitle: "Record your voice and let the installation speak.",
    heroIntro: "Record with your microphone, choose immediate or delayed playback, then send your voice to the installation.",
    recorder: {
      title: "Record your voice",
      description: `Record from a phone or computer browser, up to ${MB_LIMIT} MB per recording.`,
      start: "Start recording",
      stop: "Stop recording",
      preview: "Recorded preview",
      upload: "Upload recording",
      uploading: "Uploading...",
      recording: "Recording..."
    },
    playback: {
      title: "Choose playback time",
      immediate: "Play immediately",
      immediateHint: "The installation plays as soon as the upload is ready",
      delayed: "Play after a delay",
      delayedHint: "Wait for a chosen number of seconds after upload",
      delayLabel: "Delay time",
      delayUnit: "seconds",
      delayedSummary: "Playback will begin {seconds} seconds after upload."
    },
    status: {
      idleTitle: "Ready to record",
      idleDetail: "Tap start recording and allow microphone access.",
      readyDetail: "Your recording is ready to upload.",
      recorderReadyDetail: "Your recording is ready. Preview it or upload it to the cloud queue.",
      successTitle: "Upload complete",
      successDetail: "Your recording is queued and will play at the time you selected.",
      uploadingTitle: "Uploading now",
      uploadingDetail: "Please keep this page open until the upload finishes.",
      errorTitle: "Upload failed",
      genericError: "Please try again in a moment."
    },
    errors: {
      noFile: "Please finish a recording first.",
      unsupportedType: "This recording format is not supported. Please try another browser.",
      fileTooLarge: `Recordings must be smaller than ${MB_LIMIT} MB.`,
      requestFailed: "The upload request did not complete. Please try again shortly.",
      networkError: "The network connection was interrupted. Please try again.",
      storageNotConfigured: "Storage is not configured yet. Please check the Cloudflare R2 binding.",
      invalidDelay: `Delay must be a whole number from 1 to ${MAX_DELAY_SECONDS} seconds.`,
      recorderUnsupported: "This browser cannot record audio here. Try the latest Safari, Chrome or Edge.",
      microphoneDenied: "Microphone access was denied. Please allow microphone permission and try again.",
      recorderEmpty: "Please finish a recording before uploading it.",
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

export function resolvePlaybackDelaySeconds(playbackMode, delayValue) {
  if (playbackMode === "immediate") {
    return 0;
  }

  const seconds = normalizeDelaySeconds(delayValue);
  return playbackMode === "delayed" && seconds !== null && seconds > 0 ? seconds : null;
}

export function canStartRecording({ isRequesting, isRecording, isUploading }) {
  return !isRequesting && !isRecording && !isUploading;
}

export function getErrorMessage(errorCode, language = "zh") {
  const copy = getUiCopy(language);
  const normalizedCode = String(errorCode || "").trim();
  const knownErrors = {
    STORAGE_NOT_CONFIGURED: copy.errors.storageNotConfigured,
    UNSUPPORTED_TYPE: copy.errors.unsupportedType,
    FILE_TOO_LARGE: copy.errors.fileTooLarge,
    NO_FILE: copy.errors.noFile,
    INVALID_DELAY: copy.errors.invalidDelay
  };

  if (knownErrors[normalizedCode]) {
    return knownErrors[normalizedCode];
  }

  return normalizedCode || copy.errors.unknown;
}

export function getStatusContent(status, detail = "", language = "zh") {
  const copy = getUiCopy(language);

  if (status === "success") {
    return {
      tone: "success",
      title: copy.status.successTitle,
      detail: detail || copy.status.successDetail
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
