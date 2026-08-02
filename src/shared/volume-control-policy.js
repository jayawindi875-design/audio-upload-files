export const VOLUME_CONFIG_KEY = "config/volume-control.json";
export const VOLUME_STATUS_KEY = "status/volume-control.json";

export const DEFAULT_VOLUME_CONFIG = Object.freeze({
  enabled: true,
  mode: "farther_louder",
  minDistanceMm: 400,
  maxDistanceMm: 2500,
  minVolumePercent: 15,
  maxVolumePercent: 120,
  sensitivity: 1.6,
  angleCenterDegrees: 90,
  angleWidthDegrees: 70,
  distancePercentile: 50
});

const MODES = new Set(["farther_louder", "nearer_louder"]);

function toInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeVolumeConfig(payload = {}) {
  const minDistanceMm = Math.max(
    1,
    toInteger(payload.minDistanceMm, DEFAULT_VOLUME_CONFIG.minDistanceMm)
  );
  const maxDistanceMm = Math.max(
    minDistanceMm + 1,
    toInteger(payload.maxDistanceMm, DEFAULT_VOLUME_CONFIG.maxDistanceMm)
  );
  const rawMinVolume = Math.max(
    0,
    Math.min(150, toInteger(payload.minVolumePercent, DEFAULT_VOLUME_CONFIG.minVolumePercent))
  );
  const rawMaxVolume = Math.max(
    0,
    Math.min(150, toInteger(payload.maxVolumePercent, DEFAULT_VOLUME_CONFIG.maxVolumePercent))
  );
  const [minVolumePercent, maxVolumePercent] = [rawMinVolume, rawMaxVolume].sort((a, b) => a - b);
  const mode = MODES.has(payload.mode) ? payload.mode : DEFAULT_VOLUME_CONFIG.mode;
  const sensitivity = Math.max(
    0.3,
    Math.min(3, toNumber(payload.sensitivity, DEFAULT_VOLUME_CONFIG.sensitivity))
  );
  const angleCenterDegrees = (
    toInteger(payload.angleCenterDegrees, DEFAULT_VOLUME_CONFIG.angleCenterDegrees) % 360 + 360
  ) % 360;
  const angleWidthDegrees = Math.max(
    1,
    Math.min(360, toInteger(payload.angleWidthDegrees, DEFAULT_VOLUME_CONFIG.angleWidthDegrees))
  );
  const distancePercentile = Math.max(
    1,
    Math.min(99, toInteger(payload.distancePercentile, DEFAULT_VOLUME_CONFIG.distancePercentile))
  );

  return {
    enabled: payload.enabled !== false,
    mode,
    minDistanceMm,
    maxDistanceMm,
    minVolumePercent,
    maxVolumePercent,
    sensitivity,
    angleCenterDegrees,
    angleWidthDegrees,
    distancePercentile
  };
}

function nullableInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function normalizeVolumeStatus(payload = {}) {
  return {
    active: payload.active === true,
    distanceMm: nullableInteger(payload.distanceMm),
    volumePercent: nullableInteger(payload.volumePercent),
    mode: typeof payload.mode === "string" ? payload.mode : "",
    sink: typeof payload.sink === "string" ? payload.sink : "",
    message: typeof payload.message === "string" ? payload.message : "",
    updatedAt: nullableInteger(payload.updatedAt)
  };
}
