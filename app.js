import { extensionFromRecorderMimeType } from "./src/shared/upload-policy.js";
import {
  canStartRecording,
  getClientValidationError,
  getErrorMessage,
  getStatusContent,
  getToggleLabel,
  getUiCopy,
  resolvePlaybackDelaySeconds
} from "./src/shared/browser-state.js";

const LANGUAGE_STORAGE_KEY = "audio-upload-language";
const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];

const elements = {
  eyebrow: document.getElementById("eyebrow"),
  heroTitle: document.getElementById("hero-title"),
  heroIntro: document.getElementById("hero-intro"),
  langToggle: document.getElementById("lang-toggle"),
  recorderTitle: document.getElementById("recorder-title"),
  recorderDescription: document.getElementById("recorder-description"),
  recordStartButton: document.getElementById("record-start-button"),
  recordStopButton: document.getElementById("record-stop-button"),
  recordUploadButton: document.getElementById("record-upload-button"),
  recordIndicator: document.getElementById("record-indicator"),
  recordPreview: document.getElementById("record-preview"),
  recordPreviewTitle: document.getElementById("record-preview-title"),
  recordedAudio: document.getElementById("recorded-audio"),
  playbackTitle: document.getElementById("playback-title"),
  playbackImmediateLabel: document.getElementById("playback-immediate-label"),
  playbackImmediateHint: document.getElementById("playback-immediate-hint"),
  playbackDelayedLabel: document.getElementById("playback-delayed-label"),
  playbackDelayedHint: document.getElementById("playback-delayed-hint"),
  playbackModeInputs: [...document.querySelectorAll('input[name="playback-mode"]')],
  delayFields: document.getElementById("delay-fields"),
  delayLabel: document.getElementById("delay-label"),
  delayInput: document.getElementById("delay-seconds"),
  delayUnit: document.getElementById("delay-unit"),
  delaySummary: document.getElementById("delay-summary"),
  statusPanel: document.getElementById("status-panel"),
  statusTitle: document.getElementById("status-title"),
  statusDetail: document.getElementById("status-detail"),
  progressTrack: document.getElementById("progress-track"),
  progressBar: document.getElementById("progress-bar")
};

let currentLanguage = getStoredLanguage();
let currentStatus = { status: "idle", detail: "" };
let recordedFile = null;
let recordedAudioUrl = "";
let mediaRecorder = null;
let mediaStream = null;
let isRequestingMicrophone = false;
let isRecording = false;
let isUploading = false;

function getStoredLanguage() {
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

function getPlaybackMode() {
  return elements.playbackModeInputs.find((input) => input.checked)?.value || "immediate";
}

function setStatus(status, detail = "") {
  currentStatus = { status, detail };
  const content = getStatusContent(status, detail, currentLanguage);
  elements.statusPanel.dataset.tone = content.tone;
  elements.statusTitle.textContent = content.title;
  elements.statusDetail.textContent = content.detail;
}

function setProgress(percent) {
  if (percent <= 0) {
    elements.progressTrack.hidden = true;
    elements.progressBar.style.width = "0%";
    return;
  }

  elements.progressTrack.hidden = false;
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function refreshControls() {
  const copy = getUiCopy(currentLanguage);
  elements.recordStartButton.disabled = !canStartRecording({
    isRequesting: isRequestingMicrophone,
    isRecording,
    isUploading
  });
  elements.recordStopButton.disabled = !isRecording || isUploading;
  elements.recordUploadButton.disabled = isUploading || !recordedFile;
  elements.recordUploadButton.textContent = isUploading
    ? copy.recorder.uploading
    : copy.recorder.upload;
  elements.playbackModeInputs.forEach((input) => {
    input.disabled = isUploading;
  });
  elements.delayInput.disabled = isUploading || getPlaybackMode() !== "delayed";
}

function updatePlaybackUi() {
  const copy = getUiCopy(currentLanguage);
  const delayed = getPlaybackMode() === "delayed";
  const seconds = resolvePlaybackDelaySeconds("delayed", elements.delayInput.value);

  elements.delayFields.hidden = !delayed;
  elements.delayInput.disabled = isUploading || !delayed;
  elements.delayInput.setAttribute("aria-invalid", delayed && seconds === null ? "true" : "false");
  elements.delaySummary.textContent = seconds === null
    ? copy.errors.invalidDelay
    : copy.playback.delayedSummary.replace("{seconds}", String(seconds));
}

function applyLanguage(language) {
  const copy = getUiCopy(language);
  currentLanguage = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";

  elements.eyebrow.textContent = copy.eyebrow;
  elements.heroTitle.textContent = copy.heroTitle;
  elements.heroIntro.textContent = copy.heroIntro;
  elements.langToggle.textContent = getToggleLabel(language);
  elements.recorderTitle.textContent = copy.recorder.title;
  elements.recorderDescription.textContent = copy.recorder.description;
  elements.recordStartButton.textContent = copy.recorder.start;
  elements.recordStopButton.textContent = copy.recorder.stop;
  elements.recordPreviewTitle.textContent = copy.recorder.preview;
  elements.recordIndicator.textContent = copy.recorder.recording;
  elements.playbackTitle.textContent = copy.playback.title;
  elements.playbackImmediateLabel.textContent = copy.playback.immediate;
  elements.playbackImmediateHint.textContent = copy.playback.immediateHint;
  elements.playbackDelayedLabel.textContent = copy.playback.delayed;
  elements.playbackDelayedHint.textContent = copy.playback.delayedHint;
  elements.delayLabel.textContent = copy.playback.delayLabel;
  elements.delayUnit.textContent = copy.playback.delayUnit;

  updatePlaybackUi();
  refreshControls();
  setStatus(currentStatus.status, currentStatus.detail);
}

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  return RECORDER_MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function resetRecordedAudio() {
  recordedFile = null;
  elements.recordPreview.hidden = true;

  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
    recordedAudioUrl = "";
  }

  elements.recordedAudio.removeAttribute("src");
  elements.recordedAudio.load();
  refreshControls();
}

function buildRecordedFile(blob, mimeType) {
  const extension = extensionFromRecorderMimeType(mimeType || blob.type);
  return new File([blob], `recording-${Date.now()}${extension}`, {
    type: blob.type || mimeType || "application/octet-stream"
  });
}

function uploadFile(file, delaySeconds) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);
    formData.set("delaySeconds", String(delaySeconds));

    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) {
        setProgress((event.loaded / event.total) * 100);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response);
        return;
      }

      reject(new Error(getErrorMessage(
        xhr.response?.error || xhr.response?.message || "",
        currentLanguage
      )));
    });
    xhr.addEventListener("error", () => {
      reject(new Error(getUiCopy(currentLanguage).errors.networkError));
    });
    xhr.send(formData);
  });
}

async function uploadRecording() {
  const validationError = getClientValidationError(recordedFile, currentLanguage);
  const delaySeconds = resolvePlaybackDelaySeconds(getPlaybackMode(), elements.delayInput.value);

  if (validationError) {
    setStatus("error", validationError);
    return;
  }

  if (delaySeconds === null) {
    setStatus("error", getErrorMessage("INVALID_DELAY", currentLanguage));
    elements.delayInput.focus();
    return;
  }

  try {
    isUploading = true;
    refreshControls();
    setStatus("uploading");
    setProgress(4);
    await uploadFile(recordedFile, delaySeconds);
    setProgress(100);
    setStatus("success");
  } catch (error) {
    setStatus("error", error.message);
    setProgress(0);
  } finally {
    isUploading = false;
    refreshControls();
  }
}

async function startRecording() {
  const copy = getUiCopy(currentLanguage);

  if (!canStartRecording({
    isRequesting: isRequestingMicrophone,
    isRecording,
    isUploading
  })) {
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setStatus("error", copy.errors.recorderUnsupported);
    return;
  }

  const sessionMimeType = chooseRecorderMimeType();
  if (!sessionMimeType) {
    setStatus("error", copy.errors.recorderUnsupported);
    return;
  }

  isRequestingMicrophone = true;
  refreshControls();

  try {
    resetRecordedAudio();
    const sessionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStream = sessionStream;
    const sessionRecorder = new MediaRecorder(sessionStream, { mimeType: sessionMimeType });
    const sessionChunks = [];
    mediaRecorder = sessionRecorder;

    sessionRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size > 0) {
        sessionChunks.push(event.data);
      }
    });

    sessionRecorder.addEventListener("stop", () => {
      const blob = new Blob(sessionChunks, { type: sessionMimeType });
      recordedFile = buildRecordedFile(blob, sessionMimeType);
      recordedAudioUrl = URL.createObjectURL(blob);
      elements.recordedAudio.src = recordedAudioUrl;
      elements.recordPreview.hidden = false;
      isRequestingMicrophone = false;
      isRecording = false;
      elements.recordIndicator.hidden = true;
      setStatus("idle", getUiCopy(currentLanguage).status.recorderReadyDetail);
      mediaStream?.getTracks().forEach((track) => track.stop());
      mediaStream = null;
      mediaRecorder = null;
      refreshControls();
    });

    sessionRecorder.start();
    isRequestingMicrophone = false;
    isRecording = true;
    elements.recordIndicator.hidden = false;
    elements.recordIndicator.textContent = copy.recorder.recording;
    setStatus("idle", copy.recorder.recording);
    refreshControls();
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    mediaStream?.getTracks().forEach((track) => track.stop());
    mediaStream = null;
    mediaRecorder = null;
    isRequestingMicrophone = false;
    isRecording = false;
    elements.recordIndicator.hidden = true;
    setStatus("error", denied ? copy.errors.microphoneDenied : copy.errors.recorderUnsupported);
    refreshControls();
  }
}

elements.recordStartButton.addEventListener("click", startRecording);
elements.recordStopButton.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }
});
elements.recordUploadButton.addEventListener("click", uploadRecording);
elements.playbackModeInputs.forEach((input) => input.addEventListener("change", updatePlaybackUi));
elements.delayInput.addEventListener("input", updatePlaybackUi);
elements.langToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "zh" ? "en" : "zh");
});

window.addEventListener("beforeunload", () => {
  mediaStream?.getTracks().forEach((track) => track.stop());
  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
  }
});

applyLanguage(currentLanguage);
updatePlaybackUi();
refreshControls();
