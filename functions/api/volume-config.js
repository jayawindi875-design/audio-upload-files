import {
  DEFAULT_VOLUME_CONFIG,
  VOLUME_CONFIG_KEY,
  normalizeVolumeConfig
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
  return bucket && typeof bucket.get === "function" && typeof bucket.put === "function"
    ? bucket
    : null;
}

export async function onRequestGet(context) {
  const bucket = getBucket(context);
  if (!bucket) {
    return json({ ok: false, error: "STORAGE_NOT_CONFIGURED" }, 500);
  }

  const stored = await bucket.get(VOLUME_CONFIG_KEY);
  const config = stored ? normalizeVolumeConfig(await stored.json()) : DEFAULT_VOLUME_CONFIG;
  return json({ ok: true, config });
}

export async function onRequestPost(context) {
  const bucket = getBucket(context);
  if (!bucket) {
    return json({ ok: false, error: "STORAGE_NOT_CONFIGURED" }, 500);
  }

  const payload = await context.request.json();
  const config = normalizeVolumeConfig(payload);
  await bucket.put(VOLUME_CONFIG_KEY, JSON.stringify(config), {
    httpMetadata: {
      contentType: "application/json"
    }
  });

  return json({ ok: true, config });
}
