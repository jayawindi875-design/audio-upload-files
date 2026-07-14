import {
  buildObjectKey,
  isAllowedAudioFile,
  isAllowedFileSize
} from "../../src/shared/upload-policy.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
}

export async function onRequestPost(context) {
  const formData = await context.request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return json({ ok: false, error: "NO_FILE" }, 400);
  }

  if (!context.env?.AUDIO_UPLOADS || typeof context.env.AUDIO_UPLOADS.put !== "function") {
    return json({ ok: false, error: "STORAGE_NOT_CONFIGURED" }, 500);
  }

  if (!isAllowedAudioFile(file.name)) {
    return json({ ok: false, error: "UNSUPPORTED_TYPE" }, 415);
  }

  if (!isAllowedFileSize(file.size)) {
    return json({ ok: false, error: "FILE_TOO_LARGE" }, 413);
  }

  const key = buildObjectKey(file.name);

  await context.env.AUDIO_UPLOADS.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream"
    },
    customMetadata: {
      originalName: file.name
    }
  });

  return json({
    ok: true,
    key,
    message: "UPLOAD_SUCCESS"
  });
}
