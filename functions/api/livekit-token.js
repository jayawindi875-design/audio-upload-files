import { LIVEKIT_ROOM } from "../../src/shared/live-call-policy.js";

const TOKEN_TTL_SECONDS = 10 * 60;

function base64UrlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function jsonBase64Url(value) {
  return base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));
}

async function createToken({ apiKey, apiSecret, identity, now = Math.floor(Date.now() / 1000) }) {
  const header = jsonBase64Url({ alg: "HS256", typ: "JWT" });
  const payload = jsonBase64Url({
    iss: apiKey,
    sub: identity,
    iat: now,
    nbf: now,
    exp: now + TOKEN_TTL_SECONDS,
    video: {
      room: LIVEKIT_ROOM,
      roomJoin: true,
      canPublish: true,
      canPublishData: true,
      canSubscribe: false,
      canPublishSources: ["microphone"]
    }
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));

  return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

function errorResponse(status, error) {
  return Response.json({ ok: false, error }, { status });
}

export async function onRequestPost({ env }) {
  const url = env.LIVEKIT_URL?.trim();
  const apiKey = env.LIVEKIT_API_KEY?.trim();
  const apiSecret = env.LIVEKIT_API_SECRET?.trim();

  if (!url || !apiKey || !apiSecret) {
    return errorResponse(500, "LIVEKIT_NOT_CONFIGURED");
  }

  const identity = `web-${crypto.randomUUID()}`;
  const token = await createToken({ apiKey, apiSecret, identity });

  return Response.json({
    ok: true,
    url,
    token,
    room: LIVEKIT_ROOM,
    identity
  });
}
