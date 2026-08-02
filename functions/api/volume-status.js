import {
  VOLUME_STATUS_KEY,
  normalizeVolumeStatus
} from "../../src/shared/volume-control-policy.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getBucket(context) {
  const bucket = context.env?.AUDIO_UPLOADS;
  return bucket && typeof bucket.get === "function" ? bucket : null;
}

export async function onRequestGet(context) {
  const bucket = getBucket(context);
  if (!bucket) {
    return json({ ok: false, error: "STORAGE_NOT_CONFIGURED" }, 500);
  }

  const stored = await bucket.get(VOLUME_STATUS_KEY);
  const status = stored ? normalizeVolumeStatus(await stored.json()) : normalizeVolumeStatus();
  return json({ ok: true, status });
}
