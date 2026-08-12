import { extensionFromRecorderMimeType } from "./src/shared/upload-policy.js";
import {
  canStartCall,
  canStartRecording,
  getClientValidationError,
  getErrorMessage,
  getLiveCallStartupFailure,
  getStatusContent,
  getToggleLabel,
  getUiCopy,
  resolveCallDelaySeconds,
  resolvePlaybackDelaySeconds
} from "./src/shared/browser-state.js";

const LANGUAGE_STORAGE_KEY = "audio-upload-language";
const CALL_CHUNK_MILLISECONDS = 1000;
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
  callTitle: document.getElementById("call-title"),
  callPlaybackTitle: document.getElementById("call-playback-title"),
  callImmediateLabel: document.getElementById("call-immediate-label"),
  callImmediateHint: document.getElementById("call-immediate-hint"),
  callDelayedLabel: document.getElementById("call-delayed-label"),
  callDelayedHint: document.getElementById("call-delayed-hint"),
  callPlaybackModeInputs: [...document.querySelectorAll('input[name="call-playback-mode"]')],
  callDelayFields: document.getElementById("call-delay-fields"),
  callDelayLabel: document.getElementById("call-delay-label"),
  callDelayInput: document.getElementById("call-delay-seconds"),
  callDelayUnit: document.getElementById("call-delay-unit"),
  callDelaySummary: document.getElementById("call-delay-summary"),
  callStartButton: document.getElementById("call-start-button"),
  callStopButton: document.getElementById("call-stop-button"),
  callStateLabel: document.getElementById("call-state-label"),
  callStreamStatus: document.getElementById("call-stream-status"),
  callDelayReadout: document.getElementById("call-delay-readout"),
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
  developerToggle: document.getElementById("developer-toggle"),
  developerPanel: document.getElementById("developer-panel"),
  developerMode: document.getElementById("volume-mode"),
  minDistance: document.getElementById("min-distance-mm"),
  maxDistance: document.getElementById("max-distance-mm"),
  minVolume: document.getElementById("min-volume-percent"),
  maxVolume: document.getElementById("max-volume-percent"),
  sensitivity: document.getElementById("volume-sensitivity"),
  baselineRevolutions: document.getElementById("baseline-revolutions"),
  baselineBin: document.getElementById("baseline-bin-degrees"),
  changeThreshold: document.getElementById("change-threshold-mm"),
  stableHold: document.getElementById("stable-hold-seconds"),
  developerSave: document.getElementById("developer-save"),
  developerStatus: document.getElementById("developer-status"),
  volumeDebugCurrent: document.getElementById("volume-debug-current"),
  volumeDebugDistance: document.getElementById("volume-debug-distance"),
  volumeDebugMode: document.getElementById("volume-debug-mode"),
  volumeDebugMessage: document.getElementById("volume-debug-message"),
  volumeDebugChanged: document.getElementById("volume-debug-changed"),
  volumeDebugBaseline: document.getElementById("volume-debug-baseline"),
  volumeDebugUpdated: document.getElementById("volume-debug-updated"),
  testSongFile: document.getElementById("test-song-file"),
  testSongDelay: document.getElementById("test-song-delay"),
  testSongUpload: document.getElementById("test-song-upload"),
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
let isRequestingCallMicrophone = false;
let isCalling = false;
let isEndingCall = false;
let callRecorder = null;
let callStream = null;
let callChunkTimer = null;
let callSessionId = "";
let callChunkIndex = 0;
let callChunksUploaded = 0;
let callPendingUploads = 0;
let callUploadFailures = 0;
let callUploadChain = Promise.resolve();
let callRoom = null;
let isSavingDeveloperConfig = false;
let isUploadingTestSong = false;
let volumeStatusPollTimer = null;

function getStoredLanguage() {
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "en" ? "en" : "zh";
}

function getPlaybackMode() {
  return elements.playbackModeInputs.find((input) => input.checked)?.value || "immediate";
}

function getCallPlaybackMode() {
  return elements.callPlaybackModeInputs.find((input) => input.checked)?.value || "immediate";
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
  elements.callStartButton.disabled = !canStartCall({
    isRequesting: isRequestingCallMicrophone,
    isCalling,
    isUploading: isUploading || isEndingCall || isRequestingMicrophone || isRecording
  });
  elements.callStopButton.disabled = !isCalling || isEndingCall;
  elements.callStartButton.textContent = isRequestingCallMicrophone
    ? copy.call.connecting
    : copy.call.start;
  elements.callStopButton.textContent = isEndingCall ? copy.call.ending : copy.call.stop;
  elements.callDelayInput.disabled = isCalling || isEndingCall || isRequestingCallMicrophone;
  elements.callPlaybackModeInputs.forEach((input) => {
    input.disabled = isCalling || isEndingCall || isRequestingCallMicrophone;
  });
  elements.recordStartButton.disabled = !canStartRecording({
    isRequesting: isRequestingMicrophone || isRequestingCallMicrophone,
    isRecording: isRecording || isCalling,
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
  elements.developerSave.disabled = isSavingDeveloperConfig;
  elements.developerToggle.disabled = isSavingDeveloperConfig || isUploadingTestSong;
  elements.testSongUpload.disabled = isUploadingTestSong;
  elements.testSongFile.disabled = isUploadingTestSong;
  elements.testSongDelay.disabled = isUploadingTestSong;
}

function updateCallDelayUi() {
  const copy = getUiCopy(currentLanguage);
  const delayed = getCallPlaybackMode() === "delayed";
  const seconds = resolveCallDelaySeconds(getCallPlaybackMode(), elements.callDelayInput.value);

  elements.callDelayFields.hidden = !delayed;
  elements.callDelayInput.disabled = !delayed || isCalling || isEndingCall || isRequestingCallMicrophone;
  elements.callDelayInput.setAttribute("aria-invalid", delayed && seconds === null ? "true" : "false");
  elements.callDelaySummary.textContent = seconds === null
    ? copy.errors.invalidDelay
    : copy.call.delaySummary.replace("{seconds}", String(seconds));
}

function updateCallReadout(state = "idle") {
  const copy = getUiCopy(currentLanguage);
  const labels = {
    idle: copy.call.readyDetail,
    connecting: copy.call.connecting,
    live: copy.call.live,
    ending: copy.call.ending,
    ended: copy.call.endedTitle
  };

  elements.callStateLabel.textContent = labels[state] || labels.idle;
  elements.callStreamStatus.textContent = state === "live"
    ? (copy.call.streamLive || copy.call.live)
    : (copy.call.streamIdle || labels[state] || labels.idle);
  const delaySeconds = resolveCallDelaySeconds(getCallPlaybackMode(), elements.callDelayInput.value);
  elements.callDelayReadout.textContent = `${delaySeconds ?? 0} ${copy.call.delayUnit}`;
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

function setDeveloperStatus(message, tone = "idle") {
  elements.developerStatus.dataset.tone = tone;
  elements.developerStatus.textContent = message;
}

function formatDebugValue(value, suffix) {
  return Number.isInteger(value) ? `${value}${suffix}` : `--${suffix}`;
}

function updateVolumeDebugReadout(status) {
  const updatedAt = Number.isInteger(status?.updatedAt) ? new Date(status.updatedAt) : null;

  elements.volumeDebugCurrent.textContent = formatDebugValue(status?.volumePercent, "%");
  elements.volumeDebugDistance.textContent = formatDebugValue(status?.distanceMm, " mm");
  elements.volumeDebugMode.textContent = status?.mode || "--";
  elements.volumeDebugMessage.textContent = status?.message || (status?.active ? "active" : "idle");
  elements.volumeDebugChanged.textContent = Number.isInteger(status?.changedPoints)
    ? String(status.changedPoints)
    : "--";
  elements.volumeDebugBaseline.textContent = Number.isInteger(status?.baselinePoints)
    ? String(status.baselinePoints)
    : "--";
  elements.volumeDebugUpdated.textContent = updatedAt
    ? `Updated ${updatedAt.toLocaleTimeString()}`
    : "Waiting for Pi...";
}

async function refreshVolumeStatus() {
  try {
    const response = await fetch("/api/volume-status", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body?.ok) {
      throw new Error("status unavailable");
    }
    updateVolumeDebugReadout(body.status);
  } catch (error) {
    updateVolumeDebugReadout({
      active: false,
      volumePercent: null,
      distanceMm: null,
      mode: "",
      message: "status_unavailable",
      updatedAt: null
    });
  }
}

function setDeveloperPanelOpen(open) {
  elements.developerPanel.hidden = !open;

  if (open) {
    refreshVolumeStatus();
    if (!volumeStatusPollTimer) {
      volumeStatusPollTimer = window.setInterval(refreshVolumeStatus, 1000);
    }
    return;
  }

  if (volumeStatusPollTimer) {
    window.clearInterval(volumeStatusPollTimer);
    volumeStatusPollTimer = null;
  }
}

function getDeveloperConfigFormValue() {
  return {
    enabled: true,
    mode: elements.developerMode.value,
    minDistanceMm: elements.minDistance.value,
    maxDistanceMm: elements.maxDistance.value,
    minVolumePercent: elements.minVolume.value,
    maxVolumePercent: elements.maxVolume.value,
    sensitivity: elements.sensitivity.value,
    baselineRevolutions: elements.baselineRevolutions.value,
    baselineBinDegrees: elements.baselineBin.value,
    changeThresholdMm: elements.changeThreshold.value,
    stableHoldSeconds: elements.stableHold.value
  };
}

function applyDeveloperConfigToForm(config) {
  if (!config) {
    return;
  }

  elements.developerMode.value = config.mode || "farther_louder";
  elements.minDistance.value = String(config.minDistanceMm ?? 200);
  elements.maxDistance.value = String(config.maxDistanceMm ?? 5000);
  elements.minVolume.value = String(config.minVolumePercent ?? 20);
  elements.maxVolume.value = String(config.maxVolumePercent ?? 85);
  elements.sensitivity.value = String(config.sensitivity ?? 1.6);
  elements.baselineRevolutions.value = String(config.baselineRevolutions ?? 3);
  elements.baselineBin.value = String(config.baselineBinDegrees ?? 5);
  elements.changeThreshold.value = String(config.changeThresholdMm ?? 200);
  elements.stableHold.value = String(config.stableHoldSeconds ?? 30);
}

async function loadDeveloperConfig() {
  try {
    const response = await fetch("/api/volume-config");
    const body = await response.json();
    if (body?.ok && body.config) {
      applyDeveloperConfigToForm(body.config);
      setDeveloperStatus("Volume controls loaded.", "idle");
    } else {
      setDeveloperStatus("Volume controls not available yet.", "error");
    }
  } catch (error) {
    setDeveloperStatus("Volume controls not available yet.", "error");
  }
}

async function saveDeveloperConfig() {
  try {
    isSavingDeveloperConfig = true;
    refreshControls();
    setDeveloperStatus("Saving volume controls...", "idle");
    const response = await fetch("/api/volume-config", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(getDeveloperConfigFormValue())
    });
    const body = await response.json();
    if (!response.ok || !body?.ok) {
      throw new Error("save failed");
    }
    applyDeveloperConfigToForm(body.config);
    setDeveloperStatus("Volume controls saved.", "success");
  } catch (error) {
    setDeveloperStatus("Volume controls not saved.", "error");
  } finally {
    isSavingDeveloperConfig = false;
    refreshControls();
  }
}

async function uploadTestSong() {
  const file = elements.testSongFile.files?.[0] || null;
  const validationError = getClientValidationError(file, "en");
  const delaySeconds = resolvePlaybackDelaySeconds(
    elements.testSongDelay.value === "0" ? "immediate" : "delayed",
    elements.testSongDelay.value
  );

  if (validationError) {
    setDeveloperStatus(validationError, "error");
    return;
  }

  if (delaySeconds === null) {
    setDeveloperStatus("Delay must be 0 or a whole number from 1 to 604800 seconds.", "error");
    elements.testSongDelay.focus();
    return;
  }

  try {
    isUploadingTestSong = true;
    refreshControls();
    setDeveloperStatus("Uploading test song...", "idle");
    await uploadFile(file, delaySeconds);
    setDeveloperStatus("Test song queued.", "success");
  } catch (error) {
    setDeveloperStatus(error.message, "error");
  } finally {
    isUploadingTestSong = false;
    refreshControls();
  }
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
  elements.callTitle.textContent = copy.call.title;
  elements.callPlaybackTitle.textContent = copy.call.playbackTitle;
  elements.callImmediateLabel.textContent = copy.call.immediate;
  elements.callImmediateHint.textContent = copy.call.immediateHint;
  elements.callDelayedLabel.textContent = copy.call.delayed;
  elements.callDelayedHint.textContent = copy.call.delayedHint;
  elements.callDelayLabel.textContent = copy.call.delayLabel;
  elements.callDelayUnit.textContent = copy.call.delayUnit;
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
  updateCallDelayUi();
  updateCallReadout(isCalling ? "live" : "idle");
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

function uploadFile(file, delaySeconds, options = {}) {
  const {
    updateProgress = true,
    fields = {}
  } = options;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.set("file", file);
    formData.set("delaySeconds", String(delaySeconds));
    Object.entries(fields).forEach(([key, value]) => {
      formData.set(key, String(value));
    });

    xhr.open("POST", "/api/upload");
    xhr.responseType = "json";
    xhr.upload.addEventListener("progress", (event) => {
      if (updateProgress && event.lengthComputable) {
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

function buildCallChunkFile(blob, mimeType, sessionId, chunkIndex) {
  const extension = extensionFromRecorderMimeType(mimeType || blob.type);
  const paddedIndex = String(chunkIndex).padStart(5, "0");
  return new File([blob], `call-${sessionId}-${paddedIndex}${extension}`, {
    type: blob.type || mimeType || "application/octet-stream"
  });
}

function queueCallChunkUpload(blob, mimeType, delaySeconds) {
  if (!blob?.size || !callSessionId) {
    return;
  }

  const chunkIndex = callChunkIndex;
  callChunkIndex += 1;
  callPendingUploads += 1;
  updateCallReadout(isEndingCall ? "ending" : "live");

  callUploadChain = callUploadChain
    .then(async () => {
      const file = buildCallChunkFile(blob, mimeType, callSessionId, chunkIndex);
      await uploadFile(file, delaySeconds, {
        updateProgress: false,
        fields: {
          uploadKind: "call-chunk",
          callSessionId,
          callChunkIndex: chunkIndex
        }
      });
      callChunksUploaded += 1;
    })
    .catch((error) => {
      callUploadFailures += 1;
      setStatus("error", error.message);
    })
    .finally(() => {
      callPendingUploads = Math.max(0, callPendingUploads - 1);
      updateCallReadout(isEndingCall ? "ending" : isCalling ? "live" : "ended");
    });
}

function clearCallChunkTimer() {
  if (callChunkTimer) {
    window.clearTimeout(callChunkTimer);
    callChunkTimer = null;
  }
}

function finishCallAfterUploads() {
  callUploadChain.finally(() => {
    isEndingCall = false;
    callSessionId = "";
    if (callUploadFailures > 0) {
      setStatus("error", getUiCopy(currentLanguage).errors.requestFailed);
    } else {
      setStatus("call-ended", getUiCopy(currentLanguage).call.endedDetail);
    }
    updateCallReadout("ended");
    refreshControls();
  });
}

function startNextCallChunk(mimeType, delaySeconds) {
  if (!isCalling || isEndingCall || !callStream) {
    return;
  }

  const sessionRecorder = new MediaRecorder(callStream, { mimeType });
  const sessionChunks = [];
  callRecorder = sessionRecorder;

  sessionRecorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size > 0) {
      sessionChunks.push(event.data);
    }
  });

  sessionRecorder.addEventListener("stop", () => {
    const blob = new Blob(sessionChunks, { type: mimeType });
    queueCallChunkUpload(blob, mimeType, delaySeconds);
    callRecorder = null;

    if (isCalling && !isEndingCall) {
      startNextCallChunk(mimeType, delaySeconds);
    } else if (isEndingCall) {
      finishCallAfterUploads();
    }
  });

  sessionRecorder.start();
  clearCallChunkTimer();
  callChunkTimer = window.setTimeout(() => {
    if (sessionRecorder.state === "recording") {
      sessionRecorder.stop();
    }
  }, CALL_CHUNK_MILLISECONDS);
}

async function startCall() {
  const copy = getUiCopy(currentLanguage);

  if (!canStartCall({
    isRequesting: isRequestingCallMicrophone,
    isCalling,
    isUploading: isUploading || isEndingCall || isRequestingMicrophone || isRecording
  })) {
    return;
  }

  const hasMicrophoneApi = Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  const hasLivekitClient = Boolean(window.LivekitClient?.Room);
  if (!hasMicrophoneApi || !hasLivekitClient) {
    setStatus("call-error", getLiveCallStartupFailure({
      hasMicrophoneApi,
      hasLivekitClient
    }, currentLanguage));
    return;
  }

  const delaySeconds = resolveCallDelaySeconds(getCallPlaybackMode(), elements.callDelayInput.value);
  if (delaySeconds === null) {
    setStatus("call-error", getErrorMessage("INVALID_DELAY", currentLanguage));
    elements.callDelayInput.focus();
    return;
  }

  isRequestingCallMicrophone = true;
  updateCallReadout("connecting");
  refreshControls();

  let room = null;
  try {
    callStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 }
      }
    });
    const response = await fetch("/api/livekit-token", { method: "POST" });
    const credentials = await response.json();
    if (!response.ok || !credentials?.token || !credentials?.url) {
      throw new Error("token unavailable");
    }
    room = new window.LivekitClient.Room();
    const publishDelay = () => room.localParticipant.publishData(
      new TextEncoder().encode(JSON.stringify({ type: "playback-delay", seconds: delaySeconds })),
      { reliable: true, topic: "playback-delay" }
    );
    room.on(window.LivekitClient.RoomEvent.Reconnected, publishDelay);
    await room.connect(credentials.url, credentials.token);
    callRoom = room;
    await publishDelay();
    await room.localParticipant.publishTrack(callStream.getAudioTracks()[0], {
      source: window.LivekitClient.Track.Source.Microphone
    });
    isRequestingCallMicrophone = false;
    isCalling = true;
    setStatus("calling", copy.call.liveDetail);
    updateCallReadout("live");
    refreshControls();
  } catch (error) {
    room?.disconnect();
    callRoom = null;
    callStream?.getTracks().forEach((track) => track.stop());
    callStream = null;
    isRequestingCallMicrophone = false;
    isCalling = false;
    isEndingCall = false;
    callSessionId = "";
    setStatus("call-error", getLiveCallStartupFailure({
      hasMicrophoneApi,
      hasLivekitClient,
      errorName: error?.name
    }, currentLanguage));
    updateCallReadout("idle");
    refreshControls();
  }
}

function stopCall() {
  if (isCalling && !isEndingCall) {
    isEndingCall = true;
    isCalling = false;
    setStatus("calling", getUiCopy(currentLanguage).call.endingDetail);
    updateCallReadout("ending");
    refreshControls();
    callRoom?.disconnect();
    callRoom = null;
    callStream?.getTracks().forEach((track) => track.stop());
    callStream = null;
    isEndingCall = false;
    setStatus("call-ended", getUiCopy(currentLanguage).call.endedDetail);
    updateCallReadout("ended");
    refreshControls();
  }
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
    isRequesting: isRequestingMicrophone || isRequestingCallMicrophone,
    isRecording: isRecording || isCalling,
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

elements.callStartButton.addEventListener("click", startCall);
elements.callStopButton.addEventListener("click", stopCall);
elements.callDelayInput.addEventListener("input", updateCallDelayUi);
elements.callPlaybackModeInputs.forEach((input) => input.addEventListener("change", updateCallDelayUi));
elements.recordStartButton.addEventListener("click", startRecording);
elements.recordStopButton.addEventListener("click", () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
  }
});
elements.recordUploadButton.addEventListener("click", uploadRecording);
elements.playbackModeInputs.forEach((input) => input.addEventListener("change", updatePlaybackUi));
elements.delayInput.addEventListener("input", updatePlaybackUi);
elements.developerToggle.addEventListener("click", () => {
  setDeveloperPanelOpen(elements.developerPanel.hidden);
});
elements.developerSave.addEventListener("click", saveDeveloperConfig);
elements.testSongUpload.addEventListener("click", uploadTestSong);
elements.langToggle.addEventListener("click", () => {
  applyLanguage(currentLanguage === "zh" ? "en" : "zh");
});

window.addEventListener("beforeunload", () => {
  if (volumeStatusPollTimer) {
    window.clearInterval(volumeStatusPollTimer);
  }
  mediaStream?.getTracks().forEach((track) => track.stop());
  clearCallChunkTimer();
  callStream?.getTracks().forEach((track) => track.stop());
  if (recordedAudioUrl) {
    URL.revokeObjectURL(recordedAudioUrl);
  }
});

applyLanguage(currentLanguage);
updatePlaybackUi();
updateCallDelayUi();
updateCallReadout("idle");
refreshControls();
loadDeveloperConfig();
