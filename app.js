import {
  formatFileSize,
  getClientValidationError,
  getErrorMessage,
  getStatusContent,
  getToggleLabel,
  getUiCopy
} from "./src/shared/browser-state.js";

const LANGUAGE_STORAGE_KEY = "audio-upload-language";

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

let currentLanguage = getStoredLanguage();
let currentStatus = {
  status: "idle",
  detail: ""
};

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
  uploadButton.textContent = isUploading ? copy.stage.submitting : copy.stage.submit;
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

  setUploadingState(uploadButton.disabled);
  setStatus(currentStatus.status, currentStatus.detail);
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

langToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "zh" ? "en" : "zh");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0] || null;
  const validationError = getClientValidationError(file, currentLanguage);

  if (validationError) {
    setStatus("error", validationError);
    return;
  }

  try {
    setUploadingState(true);
    setStatus("uploading");
    setProgress(4);

    await uploadFile(file);

    setProgress(100);
    setStatus("success");
    form.reset();
    setSelectedFile(null);
  } catch (error) {
    setStatus("error", error.message);
    setProgress(0);
  } finally {
    setUploadingState(false);
  }
});

applyLanguage(currentLanguage);
