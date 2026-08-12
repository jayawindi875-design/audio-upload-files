# Live Volume Controls Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the Raspberry Pi apply the saved developer volume settings during a live call with rapid LiDAR updates, while showing only the five customer-facing controls.

**Architecture:** Load `.env` before building R2-backed volume services so the live receiver can read saved configuration and publish current status. Replace baseline-change-only readings with a direct distance reading every LiDAR revolution; the controller maps that reading to the configured volume immediately. Keep advanced radar selection defaults internally, but remove their controls from the public developer form.

**Tech Stack:** Cloudflare Pages Functions and R2, browser JavaScript, Python 3, LiveKit, PipeWire/PulseAudio `pactl`, Raspberry Pi LiDAR.

---

### Task 1: Prove and fix R2 environment loading order

**Files:**
- Modify: `consumer/main.py:30-47`
- Test: `consumer/tests/test_main.py`

**Step 1: Write the failing test**

Create a test with environment variables present only in a temporary `.env` fixture. Assert `build_volume_services_from_env()` returns the saved configuration and a callable status reporter.

**Step 2: Run the test to verify it fails**

Run: `python -m unittest consumer.tests.test_main`

Expected: the service tuple is `(None, None)` because `.env` is currently loaded too late.

**Step 3: Write minimal implementation**

Load the project `.env` at the start of `build_volume_services_from_env()` before testing for the four R2 variables.

**Step 4: Run the test to verify it passes**

Run: `python -m unittest consumer.tests.test_main`

Expected: PASS.

**Step 5: Commit**

```bash
git add consumer/main.py consumer/tests/test_main.py
git commit -m "fix: load R2 volume services from dotenv"
```

### Task 2: Emit a direct LiDAR distance every revolution

**Files:**
- Modify: `consumer/volume_control.py:180-250`
- Test: `consumer/tests/test_volume_control.py`

**Step 1: Write the failing test**

Add a reader-selection helper test that passes two consecutive point clouds with a static obstacle and asserts both yield the selected distance. This prevents the `baseline_unchanged` state from suppressing volume updates.

**Step 2: Run the test to verify it fails**

Run: `python -m unittest consumer.tests.test_volume_control`

Expected: the second static point cloud yields no distance under the baseline tracker.

**Step 3: Write minimal implementation**

Select the configured LiDAR distance directly from every complete revolution and yield it immediately. Preserve the internal fixed angle/percentile defaults; do not expose baseline settings in the customer UI.

**Step 4: Run the test to verify it passes**

Run: `python -m unittest consumer.tests.test_volume_control`

Expected: PASS.

**Step 5: Commit**

```bash
git add consumer/volume_control.py consumer/tests/test_volume_control.py
git commit -m "fix: update live volume from each lidar revolution"
```

### Task 3: Reload saved controls while the receiver runs

**Files:**
- Modify: `consumer/livekit_receiver.py:104-260`
- Modify: `consumer/volume_control.py:283-381`
- Test: `consumer/tests/test_livekit_receiver.py`
- Test: `consumer/tests/test_volume_control.py`

**Step 1: Write the failing test**

Use a config provider that returns a second configuration after the first reading. Assert the next volume command uses the new mode and limits without restarting the controller.

**Step 2: Run the test to verify it fails**

Run: `python -m unittest consumer.tests.test_livekit_receiver consumer.tests.test_volume_control`

Expected: the controller retains its construction-time configuration.

**Step 3: Write minimal implementation**

Pass a config provider into the live receiver and volume controller. Poll it at a short, bounded interval and atomically replace the normalized mapping configuration when it changes. Keep the current status reporter and include the applied distance and volume in each update.

**Step 4: Run the test to verify it passes**

Run: `python -m unittest consumer.tests.test_livekit_receiver consumer.tests.test_volume_control`

Expected: PASS.

**Step 5: Commit**

```bash
git add consumer/livekit_receiver.py consumer/volume_control.py consumer/tests
git commit -m "feat: refresh live volume controls without restart"
```

### Task 4: Simplify the developer form

**Files:**
- Modify: `index.html:154-198`
- Modify: `app.js:69-330`
- Modify: `src/shared/volume-control-policy.js:1-101`
- Test: `tests/developer-ui.test.js`
- Test: `tests/volume-config-handler.test.js`

**Step 1: Write the failing test**

Assert the public developer UI contains direction, min/max distance, and min/max volume fields, and does not contain the four baseline/change/stable-hold fields.

**Step 2: Run the test to verify it fails**

Run: `cmd /c npm.cmd test`

Expected: failure because the four advanced fields are currently rendered and posted.

**Step 3: Write minimal implementation**

Remove only the four confirmed advanced controls from HTML and app bindings. Preserve the five customer-facing controls, save action, live status panel, and test-song panel. Normalize incoming saved legacy fields to fixed defaults so old R2 objects remain compatible.

**Step 4: Run the test to verify it passes**

Run: `cmd /c npm.cmd test`

Expected: PASS.

**Step 5: Commit**

```bash
git add index.html app.js src/shared/volume-control-policy.js tests
git commit -m "fix: simplify developer volume controls"
```

### Task 5: Deploy and verify the physical system

**Files:**
- Deploy tracked code to GitHub/Cloudflare Pages and `/home/ziyi/audio-upload-files`

**Step 1: Verify local code**

Run: `cmd /c npm.cmd test`, `python -m unittest discover -s consumer/tests`, `python -m compileall -q consumer`, and `git diff --check`.

**Step 2: Deploy**

Push `master` for Pages; synchronize changed consumer files to the Raspberry Pi and restart only `audio-upload-consumer.service`.

**Step 3: Verify live behavior**

Confirm the Pages configuration endpoint, Pi service state, Pi logs showing the saved mode, fresh distance/volume status, and a live microphone stream with `ffplay` running.

