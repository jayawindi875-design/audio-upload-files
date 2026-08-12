from __future__ import annotations

import asyncio
import heapq
import inspect
import json
import os
import subprocess
import time
from dataclasses import dataclass, field
from pathlib import Path

from livekit import api, rtc
from dotenv import load_dotenv

from consumer.volume_control import LidarVolumeController, VolumeControlConfig


LIVEKIT_ROOM = "device-raspberry-001"
RASPBERRY_PI_IDENTITY = "raspberry-001"
MAX_LIVE_DELAY_SECONDS = 60
DEFAULT_PCM_PLAYER_COMMAND = (
    "ffplay -nodisp -autoexit -loglevel warning -fflags nobuffer -flags low_delay "
    "-f s16le -ar 48000 -ac 1 -i pipe:0"
)


def normalize_live_delay_seconds(value) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        seconds = int(str(value).strip())
    except (TypeError, ValueError):
        return None
    return seconds if 0 <= seconds <= MAX_LIVE_DELAY_SECONDS and str(seconds) == str(value).strip() else None


def format_livekit_track_subscription(identity: str, kind: str) -> str:
    return f"[livekit] subscribed identity={identity} kind={kind}"


def format_livekit_audio_frame(identity: str, *, byte_count: int, delay_seconds: int) -> str:
    return (
        f"[livekit] first_audio_frame identity={identity} "
        f"bytes={byte_count} delay_seconds={delay_seconds}"
    )


async def disconnect_room(room) -> None:
    result = room.disconnect()
    if inspect.isawaitable(result):
        await result


@dataclass
class DelayedPcmBuffer:
    clock: callable = time.monotonic
    _frames: list[tuple[float, int, object | None, bytes]] = field(default_factory=list)
    _sequence: int = 0

    def push(self, frame: bytes, delay_seconds: int, source=None) -> None:
        release_at = self.clock() + delay_seconds
        heapq.heappush(self._frames, (release_at, self._sequence, source, bytes(frame)))
        self._sequence += 1

    def discard_source(self, source) -> None:
        self._frames = [frame for frame in self._frames if frame[2] != source]
        heapq.heapify(self._frames)

    def pop_due(self) -> list[bytes]:
        due = []
        now = self.clock()
        while self._frames and self._frames[0][0] <= now:
            _, _, _, frame = heapq.heappop(self._frames)
            due.append(frame)
        return due


class RealtimePcmPlayer:
    def __init__(self, command: str = DEFAULT_PCM_PLAYER_COMMAND, process_factory=subprocess.Popen):
        self.command = command
        self.process_factory = process_factory
        self.process = None

    def write(self, pcm: bytes) -> None:
        if not pcm:
            return
        if self.process is None or self.process.poll() is not None:
            self.process = self.process_factory(self.command, shell=True, stdin=subprocess.PIPE)
        self.process.stdin.write(pcm)
        self.process.stdin.flush()

    def close(self) -> None:
        if self.process is None:
            return
        if self.process.stdin:
            self.process.stdin.close()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.terminate()
        self.process = None


class LiveKitAudioReceiver:
    def __init__(
        self,
        *,
        url: str,
        api_key: str,
        api_secret: str,
        player: RealtimePcmPlayer | None = None,
        volume_config: dict | None = None,
        volume_status_reporter=None,
        volume_config_provider=None,
    ):
        self.url = url
        self.api_key = api_key
        self.api_secret = api_secret
        self.player = player or RealtimePcmPlayer()
        self.buffer = DelayedPcmBuffer()
        self.delays_by_identity: dict[str, int] = {}
        self.volume_config = VolumeControlConfig.from_dict(volume_config)
        self.volume_status_reporter = volume_status_reporter
        self.volume_config_provider = volume_config_provider
        self._volume_controller = None
        self._audio_tasks: set[asyncio.Task] = set()
        self._audio_tasks_by_track: dict[str, asyncio.Task] = {}
        self._active_audio_source: tuple[str, str] | None = None
        self._audio_started_for_sources: set[tuple[str, str]] = set()
        self._stop = asyncio.Event()

    def create_join_token(self) -> str:
        return (
            api.AccessToken(self.api_key, self.api_secret)
            .with_identity(RASPBERRY_PI_IDENTITY)
            .with_name("Raspberry Pi audio receiver")
            .with_grants(api.VideoGrants(
                room_join=True,
                room=LIVEKIT_ROOM,
                can_publish=False,
                can_publish_data=False,
                can_subscribe=True,
            ))
            .to_jwt()
        )

    def _handle_data(self, packet) -> None:
        if packet.topic != "playback-delay" or packet.participant is None:
            return
        try:
            payload = json.loads(packet.data.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return
        if payload.get("type") != "playback-delay":
            return
        delay = normalize_live_delay_seconds(payload.get("seconds"))
        if delay is not None:
            self.delays_by_identity[packet.participant.identity] = delay

    def _activate_audio_subscription(self, identity: str, track_sid: str) -> tuple[bool, tuple[str, str] | None]:
        source = (identity, track_sid)
        previous_source = self._active_audio_source
        if previous_source == source:
            return False, None
        self._active_audio_source = source
        return True, previous_source

    def _finish_audio_subscription(self, identity: str, track_sid: str) -> bool:
        if self._active_audio_source != (identity, track_sid):
            return False
        self._active_audio_source = None
        return True

    def _cancel_audio_task(self, track_sid: str) -> None:
        task = self._audio_tasks_by_track.pop(track_sid, None)
        if task is not None:
            task.cancel()

    async def _consume_audio(self, track, participant, source: tuple[str, str]) -> None:
        stream = rtc.AudioStream(track, sample_rate=48000, num_channels=1)
        try:
            async for event in stream:
                if self._active_audio_source != source:
                    break
                delay = self.delays_by_identity.get(participant.identity, 0)
                if source not in self._audio_started_for_sources:
                    self._audio_started_for_sources.add(source)
                    print(format_livekit_audio_frame(
                        participant.identity,
                        byte_count=len(event.frame.data.tobytes()),
                        delay_seconds=delay,
                    ))
                self.buffer.push(event.frame.data.tobytes(), delay, source=source)
        finally:
            await stream.aclose()

    async def _drain_buffer(self) -> None:
        while not self._stop.is_set():
            for frame in self.buffer.pop_due():
                self.player.write(frame)
            await asyncio.sleep(0.01)

    async def run(self) -> None:
        room = rtc.Room()
        room.on("data_received", self._handle_data)

        def handle_track(track, publication, participant):
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            track_sid = publication.sid or track.sid
            should_start, previous_source = self._activate_audio_subscription(participant.identity, track_sid)
            if not should_start:
                return
            if previous_source:
                self._cancel_audio_task(previous_source[1])
                self.buffer.discard_source(previous_source)
            print(format_livekit_track_subscription(participant.identity, "audio"))
            source = (participant.identity, track_sid)
            task = asyncio.create_task(self._consume_audio(track, participant, source))
            self._audio_tasks.add(task)
            self._audio_tasks_by_track[track_sid] = task

            def finish_audio_task(completed_task):
                self._audio_tasks.discard(completed_task)
                if self._audio_tasks_by_track.get(track_sid) is completed_task:
                    self._audio_tasks_by_track.pop(track_sid, None)
                    self._finish_audio_subscription(participant.identity, track_sid)

            task.add_done_callback(finish_audio_task)

        def handle_track_unsubscribed(track, publication, participant):
            if track.kind != rtc.TrackKind.KIND_AUDIO:
                return
            track_sid = publication.sid or track.sid
            self._cancel_audio_task(track_sid)
            self.buffer.discard_source((participant.identity, track_sid))
            self._finish_audio_subscription(participant.identity, track_sid)

        room.on("track_subscribed", handle_track)
        room.on("track_unsubscribed", handle_track_unsubscribed)
        if self.volume_config.enabled:
            self._volume_controller = LidarVolumeController(
                self.volume_config,
                status_reporter=self.volume_status_reporter,
                volume_config_provider=self.volume_config_provider,
            )
            self._volume_controller.start()
        drain_task = asyncio.create_task(self._drain_buffer())
        try:
            await room.connect(self.url, self.create_join_token())
            await self._stop.wait()
        finally:
            self._stop.set()
            drain_task.cancel()
            await asyncio.gather(drain_task, *self._audio_tasks, return_exceptions=True)
            await disconnect_room(room)
            self.player.close()
            if self._volume_controller:
                self._volume_controller.stop()

    def stop(self) -> None:
        self._stop.set()


def build_receiver_from_env(
    volume_config=None,
    volume_status_reporter=None,
    volume_config_provider=None,
) -> LiveKitAudioReceiver:
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    required = ("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET")
    missing = [name for name in required if not os.environ.get(name, "").strip()]
    if missing:
        raise ValueError("Missing required environment variable: " + ", ".join(missing))
    receiver = LiveKitAudioReceiver(
        url=os.environ["LIVEKIT_URL"].strip(),
        api_key=os.environ["LIVEKIT_API_KEY"].strip(),
        api_secret=os.environ["LIVEKIT_API_SECRET"].strip(),
        volume_config=volume_config,
        volume_status_reporter=volume_status_reporter,
        volume_config_provider=volume_config_provider,
    )
    player_command = os.environ.get("LIVEKIT_PCM_PLAYER_COMMAND", "").strip()
    if player_command:
        receiver.player = RealtimePcmPlayer(player_command)
    return receiver
