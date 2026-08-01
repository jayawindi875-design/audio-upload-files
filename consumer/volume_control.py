from __future__ import annotations

from dataclasses import dataclass
import queue
import subprocess
import threading
import time


MIN_VALID_INTENSITY = 30
LIDAR_BAUDRATE = 230400
LIDAR_DEVICE = "/dev/ttyACM0"


MODE_FARTHER_LOUDER = "farther_louder"
MODE_NEARER_LOUDER = "nearer_louder"


def _read_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_bool(value, default: bool) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class VolumeControlConfig:
    enabled: bool = True
    mode: str = MODE_FARTHER_LOUDER
    min_distance_mm: int = 200
    max_distance_mm: int = 5000
    min_volume_percent: int = 20
    max_volume_percent: int = 85

    @classmethod
    def from_dict(cls, payload: dict | None) -> "VolumeControlConfig":
        payload = payload or {}
        return cls(
            enabled=_read_bool(payload.get("enabled"), True),
            mode=str(payload.get("mode") or MODE_FARTHER_LOUDER),
            min_distance_mm=_read_int(payload.get("minDistanceMm"), 200),
            max_distance_mm=_read_int(payload.get("maxDistanceMm"), 5000),
            min_volume_percent=_read_int(payload.get("minVolumePercent"), 20),
            max_volume_percent=_read_int(payload.get("maxVolumePercent"), 85),
        ).normalized()

    def normalized(self) -> "VolumeControlConfig":
        min_distance = max(1, self.min_distance_mm)
        max_distance = max(min_distance + 1, self.max_distance_mm)
        min_volume = max(0, min(150, self.min_volume_percent))
        max_volume = max(0, min(150, self.max_volume_percent))
        low_volume, high_volume = sorted((min_volume, max_volume))
        mode = self.mode if self.mode in {MODE_FARTHER_LOUDER, MODE_NEARER_LOUDER} else MODE_FARTHER_LOUDER

        return VolumeControlConfig(
            enabled=self.enabled,
            mode=mode,
            min_distance_mm=min_distance,
            max_distance_mm=max_distance,
            min_volume_percent=low_volume,
            max_volume_percent=high_volume,
        )


def map_distance_to_volume_percent(distance_mm: int, config: VolumeControlConfig) -> int:
    config = config.normalized()
    distance = max(config.min_distance_mm, min(config.max_distance_mm, int(distance_mm)))
    ratio = (distance - config.min_distance_mm) / (config.max_distance_mm - config.min_distance_mm)

    if config.mode == MODE_NEARER_LOUDER:
        ratio = 1 - ratio

    volume = config.min_volume_percent + ratio * (
        config.max_volume_percent - config.min_volume_percent
    )
    return int(round(volume))


class LidarDistanceReader:
    def __init__(self, device: str = LIDAR_DEVICE, baudrate: int = LIDAR_BAUDRATE):
        self.device = device
        self.baudrate = baudrate

    def read_distances(self, stop_event: threading.Event):
        try:
            import serial
        except ImportError:
            print("[volume] pyserial is not installed; lidar volume control disabled")
            return

        try:
            ser = serial.Serial(self.device, self.baudrate, timeout=1)
        except Exception as exc:
            print(f"[volume] unable to open lidar {self.device}: {exc}")
            return

        last_angle = 0
        circle_count = 0
        all_valid_points = []

        with ser:
            while not stop_event.is_set():
                try:
                    sync_byte = ser.read(1)
                    if not sync_byte or sync_byte[0] != 0xA5:
                        continue

                    header_b = ser.read(1)
                    header_c = ser.read(1)
                    if not header_b or not header_c or header_b[0] != 0x5A or header_c[0] != 0x3A:
                        continue

                    data = ser.read(55)
                    if len(data) != 55:
                        continue

                    start_angle = (data[2] * 256 + data[3]) / 100.0
                    end_angle = (data[52] * 256 + data[53]) / 100.0
                    angle_diff = (end_angle - start_angle + 360) % 360
                    angle_step = angle_diff / 15.0

                    for index in range(16):
                        offset = 4 + index * 3
                        distance = data[offset] * 256 + data[offset + 1]
                        intensity = data[offset + 2]
                        angle = (start_angle + angle_step * index) % 360
                        if intensity >= MIN_VALID_INTENSITY:
                            all_valid_points.append((distance, angle))

                    if last_angle - start_angle > 100:
                        circle_count += 1
                        if circle_count % 3 == 0 and all_valid_points:
                            nearest = min(all_valid_points, key=lambda item: item[0])
                            yield nearest[0]
                            all_valid_points.clear()
                    last_angle = start_angle
                except Exception as exc:
                    print(f"[volume] lidar read error: {exc}")
                    time.sleep(0.1)


class LidarVolumeController:
    def __init__(
        self,
        config: VolumeControlConfig,
        distance_reader: LidarDistanceReader | None = None,
        sink: str = "@DEFAULT_SINK@",
        command_runner=subprocess.run,
    ):
        self.config = config.normalized()
        self.distance_reader = distance_reader or LidarDistanceReader()
        self.sink = sink
        self.command_runner = command_runner
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        if self.config.enabled:
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=1)

    def _set_volume(self, volume_percent: int):
        self.command_runner(
            ["pactl", "set-sink-volume", self.sink, f"{volume_percent}%"],
            check=False,
        )

    def _run(self):
        pending = queue.Queue(maxsize=1)
        for distance in self.distance_reader.read_distances(self.stop_event):
            if self.stop_event.is_set():
                return
            volume = map_distance_to_volume_percent(distance, self.config)
            if pending.full():
                try:
                    pending.get_nowait()
                except queue.Empty:
                    pass
            pending.put(volume)
            self._set_volume(volume)
            print(f"[volume] distance_mm={distance} volume={volume}% mode={self.config.mode}")
