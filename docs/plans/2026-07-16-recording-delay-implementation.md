# Recording Delay Playback Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove local audio-file uploading and let users schedule recorded audio for playback after any integer number of seconds.

**Architecture:** The browser submits `delaySeconds` with the recorded file. The Pages Function validates it, computes an authoritative server-side `playAt`, and embeds that timestamp in the R2 object key; the Python consumer parses keys and only downloads due recordings.

**Tech Stack:** HTML/CSS, browser JavaScript, Cloudflare Pages Functions/R2, Node test runner, Python unittest/boto3.

---

### Task 1: Define delay policy and scheduled object keys

**Files:**
- Modify: `src/shared/upload-policy.js`
- Test: `tests/upload-policy.test.js`

**Steps:**
1. Add failing tests for integer delays from 0 through 604800, invalid values, scheduled key generation, and scheduled-key parsing.
2. Run `cmd /c npm.cmd test` and confirm the new assertions fail because the APIs do not exist.
3. Add minimal shared helpers and constants for validation, key construction, and parsing.
4. Run the Node tests and confirm they pass.

### Task 2: Accept delay in the Cloudflare upload endpoint

**Files:**
- Modify: `functions/api/upload.js`
- Test: `tests/upload-handler.test.js`

**Steps:**
1. Add failing tests that verify `INVALID_DELAY`, server-derived `playAt`, and scheduled R2 keys.
2. Run the handler tests and confirm expected failures.
3. Read `delaySeconds`, validate it, compute `playAt` using server time, and return it in the response.
4. Run all Node tests.

### Task 3: Make recording the only browser workflow

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Modify: `styles.css`
- Modify: `src/shared/browser-state.js`
- Test: `tests/browser-state.test.js`

**Steps:**
1. Add failing tests for bilingual recording-only copy, delay labels, formatting, and delay error messages.
2. Run browser-state tests and confirm expected failures.
3. Remove the file picker/form DOM and JavaScript paths.
4. Add the numeric delay input, live wait summary, and delayed-success copy while preserving recording, preview, upload progress, and language switching.
5. Run all Node tests.

### Task 4: Defer consumer playback until due

**Files:**
- Modify: `consumer/worker.py`
- Test: `consumer/tests/test_worker.py`

**Steps:**
1. Add failing tests for skipping future recordings, selecting the earliest due recording, and immediately processing legacy keys.
2. Run `python -m unittest discover consumer/tests -v` and confirm expected failures.
3. Inject a clock into `QueueWorker`, parse scheduled timestamps, and filter/sort due objects without downloading future files.
4. Run all Python tests.

### Task 5: Documentation and full verification

**Files:**
- Modify: `README.md`

**Steps:**
1. Update deployment, user flow, object key, delay boundary, and consumer behavior documentation.
2. Run `cmd /c npm.cmd test`.
3. Run `python -m unittest discover consumer/tests -v`.
4. Run `git diff --check` and inspect `git status --short`.
5. Commit with the repository's `[feat]` convention and push `master` to `origin`.
