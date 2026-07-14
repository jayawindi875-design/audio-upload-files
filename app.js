import {
  extensionFromRecorderMimeType
} from "./src/shared/upload-policy.js";
import {
  formatFileSize,
  getClientValidationError,
  getErrorMessage,
  getStatusContent,
  getToggleLabel,
  getUiCopy
} from "./src/shared/browser-state.js";

const LANGUAGE_STORAGE_KEY = "audio-upload-language";
const RECORDER_MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg"
];

const form = document.getElementById("upload-form");
const fileInput = document.getElementById("audio-file");
const fileMeta = document.getElementById("file-meta");
const fileName = document.getElementById("file-name");
const fileSize = document.getElementById("file-size");
const uploadButton = document.getElementById("upload-button");
const statusPanel = document.getElementById("status-panel");
const statusTitle = document.getElementById("status-title");
const statusDetail = document.getElementById("status-detail");
const progressTrack = document.getElementById("progress-track");
const progressBar = document.getElementById("progress-bar");
const eyebrow = document.getElementById("eyebrow");
const heroTitle = document.getElementById("hero-title");
const heroIntro = document.getElementById("hero-intro");
const uploadTitle = document.getElementById("upload-title");
const uploadDescription = document.getElementById("upload-description");
const filePickerLabel = document.getElementById("file-picker-label");
const filePickerHint = document.getElementById("file-picker-hint");
const langToggle = document.getElementById("lang-toggle");
const recorderTitle = document.getElementById("recorder-title");
const recorderDescription = document.getElementById("recorder-description");
const recordStartButton = document.getElementById("record-start-button");
const recordStopButton = document.getElementById("record-stop-button");
const recordUploadButton = document.getElementById("record-upload-button");
const recordIndicator = document.getElementById("record-indicator");
const recordPreview = document.getElementById("record-preview");
const recordPreviewTitle = document.getElementById("record-preview-title");
const recordedAudio = document.getElementById("recorded-audio");

let currentLanguage = getStoredLanguage();
let currentStatus = {
  status: "idle",
  detail: ""
};
let recordedBlob = null;
let recordedFile = null;
let recordedAudioUrl = "";
let mediaRecorder = null;
let mediaStream = null;
let recordedChunks = [];
let recorderMimeType = "";

function getStoredLanguage() {
  const savedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return savedLanguage === "en" ? "en" : "zh";
}

function setStatus(status, detail = "") {
  currentStatus = { status, detail };
  const content = getStatusContent(status, detail, currentLanguage);
  statusPanel.dataset.tone = content.tone;
  statusTitle.textContent = content.title;
  statusDetail.textContent = content.detail;
}

function setProgress(percent) {
  if (percent <= 0) {
    progressTrack.hidden = true;
    progressBar.style.width = "0%";
    return;
  }

  progressTrack.hidden = false;
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function setSelectedFile(file) {
  if (!file) {
    fileMeta.hidden = true;
    fileName.textContent = "";
    fileSize.textContent = "";
    return;
  }

  fileMeta.hidden = false;
  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);
}

function setUploadingState(isUploading) {
  const copy = getUiCopy(currentLanguage);
  uploadButton.disabled = isUploading;
  recordUploadButton.disabled = isUploading || !recordedFile;
  uploadButton.textContent = isUploading ? copy.stage.submitting : copy.stage.submit;
  recordUploadButton.textContent = isUploading ? copy.stage.submitting : copy.recorder.upload;
}

function setRecordingState(isRecording) {
  const copy = getUiCopy(currentLanguage);
  recordStartButton.disabled = isRecording;
  recordStopButton.disabled = !isRecording;
  recordIndicator.hidden = !isRecording;
  recordIndicator.textContent = copy.recorder.recording;
}

function applyLanguage(language) {
  const copy = getUiCopy(language);

  currentLanguage = language;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language === "en" ? "en" : "zh-CN";

  eyebrow.textContent = copy.eyebrow;
  heroTitle.textContent = copy.heroTitle;
  heroIntro.textContent = copy.heroIntro;
  uploadTitle.textContent = copy.stage.title;
  uploadDescription.textContent = copy.stage.description;
  filePickerLabel.textContent = copy.stage.pickerLabel;
  filePickerHint.textContent = copy.stage.pickerHint;
  langToggle.textContent = getToggleLabel(language);
  recorderTitle.textContent = copy.recorder.title;
  recorderDescription.textContent = copy.recorder.description;
  recordStartButton.textContent = copy.recorder.start;
  recordStopButton.textContent = copy.recorder.stop;
  recordUploadButton.textContent = copy.recorder.upload;
  recordPreviewTitle.textContent = copy.recorder.preview;
  recordIndicator.textContent = copy.recorder.recording;

  setUploadingState(uploadButton.disabled);
  setStatus(currentStatus.status, currentStatus.detail);
}

function chooseRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  for (const mimeType of RECORDER_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return "";
}

function resetRecordedAudio() {
  recordedBlob = null;
  recordedFile = null;
  recordUploadButton.disabled = true;
  recordPreview.hidden = true;

  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
    recordedAudioUrl = "";
  }

  recordedAudio.removeAttribute("src");
  recordedAudio.load();
}

function buildRecordedFile(blob, mimeType) {
  const extension = extensionFromRecorderMimeType(mimeType || blob.type);
  return new File([blob], `recording-${Date.now()}${extension}`, {
    type: blob.type || mimeType || "application/octet-stream"
  });
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);

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

      const message = getErrorMessage(
        xhr.response?.error || xhr.response?.message || "",
        currentLanguage
      );
      reject(new Error(message));
    });

    xhr.addEventListener("error", () => {
      reject(new Error(getUiCopy(currentLanguage).errors.networkError));
    });

    xhr.send(formData);
  });
}

async function uploadPreparedFile(file) {
  const validationError = getClientValidationError(file, currentLanguage);

  if (validationError) {
    setStatus("error", validationError);
    return false;
  }

  try {
    setUploadingState(true);
    setStatus("uploading");
    setProgress(4);

    await uploadFile(file);

    setProgress(100);
    setStatus("success");
    return true;
  } catch (error) {
    setStatus("error", error.message);
    setProgress(0);
    return false;
  } finally {
    setUploadingState(false);
  }
}

async function startRecording() {
  const copy = getUiCopy(currentLanguage);

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    setStatus("error", copy.errors.recorderUnsupported);
    return;
  }

  recorderMimeType = chooseRecorderMimeType();
  if (!recorderMimeType) {
    setStatus("error", copy.errors.recorderUnsupported);
    return;
  }

  try {
    resetRecordedAudio();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: recorderMimeType });
    recordedChunks = [];

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data && event.data.size > 0) {
        recordedChunks.push(event.data);
      }
    });

    mediaRecorder.addEventListener("stop", () => {
      const blob = new Blob(recordedChunks, { type: recorderMimeType });
      recordedBlob = blob;
      recordedFile = buildRecordedFile(blob, recorderMimeType);
      recordedAudioUrl = URL.createObjectURL(blob);
      recordedAudio.src = recordedAudioUrl;
      recordPreview.hidden = false;
      recordUploadButton.disabled = false;
      setRecordingState(false);
      setStatus("idle", getUiCopy(currentLanguage).status.recorderReadyDetail);

      mediaStream?.getTracks().forEach((track) => track.stop());
      mediaStream = null;
      mediaRecorder = null;
      recordedChunks = [];
    });

    mediaRecorder.start();
    setRecordingState(true);
    setStatus("idle", copy.recorder.recording);
  } catch (error) {
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    setRecordingState(false);
    setStatus("error", denied ? copy.errors.microphoneDenied : copy.errors.recorderUnsupported);
  }
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0] || null;
  const validationError = getClientValidationError(file, currentLanguage);

  setSelectedFile(file);
  setProgress(0);

  if (validationError) {
    setStatus("error", validationError);
    return;
  }

  setStatus("idle", getUiCopy(currentLanguage).status.readyDetail);
});

recordStartButton.addEventListener("click", async () => {
  await startRecording();
});

recordStopButton.addEventListener("click", () => {
  stopRecording();
});

recordUploadButton.addEventListener("click", async () => {
  if (!recordedFile) {
    setStatus("error", getUiCopy(currentLanguage).errors.recorderEmpty);
    return;
  }

  await uploadPreparedFile(recordedFile);
});

langToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "zh" ? "en" : "zh");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0] || null;
  const uploaded = await uploadPreparedFile(file);

  if (uploaded && file) {
    form.reset();
    setSelectedFile(null);
  }
});

applyLanguage(currentLanguage);
setRecordingState(false);
