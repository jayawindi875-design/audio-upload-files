import {
  formatFileSize,
  getClientValidationError,
  getStatusContent
} from "./src/shared/browser-state.js";

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

function setStatus(status, detail = "") {
  const content = getStatusContent(status, detail);
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
  uploadButton.disabled = isUploading;
  uploadButton.textContent = isUploading ? "上传中..." : "上传到云端";
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

      const message = xhr.response?.error || "上传请求未完成，请稍后重试。";
      reject(new Error(message));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("网络连接异常，请稍后重试。"));
    });

    xhr.send(formData);
  });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0] || null;
  const validationError = getClientValidationError(file);

  setSelectedFile(file);
  setProgress(0);

  if (validationError) {
    setStatus("error", validationError);
    return;
  }

  setStatus("idle", "文件已就绪，点击下方按钮即可开始上传。");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const file = fileInput.files?.[0] || null;
  const validationError = getClientValidationError(file);

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
