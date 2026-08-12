# LiveKit One-Way Call Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace R2-recording chunk uploads with a browser-to-Raspberry-Pi LiveKit audio stream that supports a 0–60 second playback delay while retaining LiDAR-controlled output volume.

**Architecture:** A Cloudflare Pages Function mints short-lived, publisher-only browser tokens. The browser publishes its microphone through LiveKit and sends the selected delay as a reliable data packet. A Raspberry Pi Python participant subscribes to microphone audio, buffers PCM frames until their release time, and writes them to a persistent audio player while the existing LiDAR volume controller continues controlling the output sink.

**Tech Stack:** Cloudflare Pages Functions, Web Crypto JWT signing, LiveKit JavaScript browser SDK, LiveKit Python RTC/API SDK, Python asyncio, existing LiDAR volume controller, Node test runner, Python unittest.

---

### Task 1: Define call constants and validate the bounded delay

**Files:**
- Create: `src/shared/live-call-policy.js`
- Create: `tests/live-call-policy.test.js`

**Step 1: Write the failing test**

Test that `normalizeLiveDelaySeconds` accepts whole numbers from `0` through `60`, rejects fractions/out-of-range values, and that the room and participant identities are stable constants.

**Step 2: Run test to verify it fails**

Run: `cmd /c npm.cmd test -- tests/live-call-policy.test.js`
Expected: FAIL because the policy module is absent.

**Step 3: Write minimal implementation**

Export `MAX_LIVE_DELAY_SECONDS = 60`, `LIVEKIT_ROOM = "device-raspberry-001"`, `RASPBERRY_PI_IDENTITY = "raspberry-001"`, and strict delay parsing.

**Step 4: Run test to verify it passes**

Run: `cmd /c npm.cmd test -- tests/live-call-policy.test.js`
Expected: PASS.

### Task 2: Mint restricted browser join tokens in Cloudflare

**Files:**
- Create: `functions/api/livekit-token.js`
- Create: `tests/livekit-token-handler.test.js`

**Step 1: Write the failing test**

Test a POST request produces an HS256 JWT with the fixed room, a unique web identity, `roomJoin`, microphone-only publishing, data publishing, no subscriptions, and a short expiry. Test missing Cloudflare secrets returns a configuration failure.

**Step 2: Run test to verify it fails**

Run: `cmd /c npm.cmd test -- tests/livekit-token-handler.test.js`
Expected: FAIL because the endpoint is absent.

**Step 3: Write minimal implementation**

Implement base64url encoding and `crypto.subtle.sign` inside the Pages Function; never return API credentials. Return only `{ url, token, room, identity }`.

**Step 4: Run test to verify it passes**

Run: `cmd /c npm.cmd test -- tests/livekit-token-handler.test.js`
Expected: PASS.

### Task 3: Replace uploaded call chunks with browser WebRTC publishing

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `src/shared/browser-state.js`
- Modify: `tests/browser-state.test.js`
- Modify: `tests/developer-ui.test.js`

**Step 1: Write the failing tests**

Test call UI copy describes a real-time stream and the primary call markup no longer reports queued uploads. Test the LiveKit UMD SDK is included before `app.js`.

**Step 2: Run tests to verify they fail**

Run: `cmd /c npm.cmd test -- tests/browser-state.test.js tests/developer-ui.test.js`
Expected: FAIL because the legacy chunk-upload UI remains.

**Step 3: Write minimal implementation**

Load the official LiveKit browser UMD SDK. On start, validate 0–60 seconds, obtain `/api/livekit-token`, connect a room, publish only the microphone, and reliably send `{ type: "playback-delay", seconds }` before publishing audio and after reconnect. On stop, close the track and disconnect. Retain the legacy recording/upload controls only inside developer controls.

**Step 4: Run tests to verify they pass**

Run: `cmd /c npm.cmd test -- tests/browser-state.test.js tests/developer-ui.test.js`
Expected: PASS.

### Task 4: Add a Raspberry Pi LiveKit audio receiver with timed buffering

**Files:**
- Create: `consumer/livekit_receiver.py`
- Create: `consumer/tests/test_livekit_receiver.py`
- Modify: `consumer/config.py`
- Modify: `consumer/main.py`
- Modify: `consumer/player.py`
- Modify: `requirements.txt`
- Modify: `.env.example`

**Step 1: Write the failing tests**

Test delay validation clamps to 0–60 seconds, frames are not emitted before their release time, due frames are emitted in order, and the playback process is closed cleanly. Test the receiver configuration requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` only when LiveKit mode is selected.

**Step 2: Run tests to verify they fail**

Run: `python -m unittest consumer.tests.test_livekit_receiver -v`
Expected: FAIL because the receiver module is absent.

**Step 3: Write minimal implementation**

Create a subscriber-only LiveKit participant using a locally minted Pi token. Subscribe only to remote microphone tracks, read 48 kHz mono PCM frames, enqueue each with `monotonic() + selected_delay`, and send only due frames to a persistent ffplay-compatible stdin player. Start the existing `LidarVolumeController` for the duration of the receiver and retain R2 volume-config/status support where configured.

**Step 4: Run tests to verify they pass**

Run: `python -m unittest consumer.tests.test_livekit_receiver -v`
Expected: PASS.

### Task 5: Update documentation and run full verification

**Files:**
- Modify: `README.md`
- Modify: `.env.example`

**Step 1: Update operational documentation**

Document the LiveKit Cloud variables in Cloudflare, the Pi-local variables, the 0–60 second buffering limit, and that R2 audio uploads are no longer part of the call path.

**Step 2: Run full verification**

Run: `cmd /c npm.cmd test`
Expected: PASS.

Run: `python -m unittest discover consumer/tests -v`
Expected: PASS.

**Step 3: Run syntax checks**

Run: `python -m py_compile consumer/*.py`
Expected: PASS.

