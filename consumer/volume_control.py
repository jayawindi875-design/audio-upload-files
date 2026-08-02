from __future__ import annotations

from dataclasses import dataclass, replace
import glob
import math
import os
from pathlib import Path
import queue
import subprocess
import threading
import time


MIN_VALID_INTENSITY = 30
LIDAR_BAUDRATE = 230400
LIDAR_DEVICE = "/dev/ttyACM0"
LIDAR_DEVICE_PATTERNS = (
    "/dev/serial/by-id/*",
    "/dev/ttyACM*",
    "/dev/ttyUSB*",
)


MODE_FARTHER_LOUDER = "farther_louder"
MODE_NEARER_LOUDER = "nearer_louder"


def _read_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _read_float(value, default: float) -> float:
    try:
        return float(value)
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
    sensitivity: float = 1.6
    angle_center_degrees: int = 90
    angle_width_degrees: int = 70
    distance_percentile: int = 50
    baseline_revolutions: int = 3
    baseline_bin_degrees: int = 5
    change_threshold_mm: int = 200
    stable_hold_seconds: int = 30

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
            sensitivity=_read_float(payload.get("sensitivity"), 1.6),
            angle_center_degrees=_read_int(payload.get("angleCenterDegrees"), 90),
            angle_width_degrees=_read_int(payload.get("angleWidthDegrees"), 70),
            distance_percentile=_read_int(payload.get("distancePercentile"), 50),
            baseline_revolutions=_read_int(payload.get("baselineRevolutions"), 3),
            baseline_bin_degrees=_read_int(payload.get("baselineBinDegrees"), 5),
            change_threshold_mm=_read_int(payload.get("changeThresholdMm"), 200),
            stable_hold_seconds=_read_int(payload.get("stableHoldSeconds"), 30),
        ).normalized()

    def normalized(self) -> "VolumeControlConfig":
        min_distance = max(1, self.min_distance_mm)
        max_distance = max(min_distance + 1, self.max_distance_mm)
        min_volume = max(0, min(150, self.min_volume_percent))
        max_volume = max(0, min(150, self.max_volume_percent))
        low_volume, high_volume = sorted((min_volume, max_volume))
        mode = self.mode if self.mode in {MODE_FARTHER_LOUDER, MODE_NEARER_LOUDER} else MODE_FARTHER_LOUDER
        sensitivity = max(0.3, min(3.0, float(self.sensitivity)))
        angle_center = int(self.angle_center_degrees) % 360
        angle_width = max(1, min(360, int(self.angle_width_degrees)))
        distance_percentile = max(1, min(99, int(self.distance_percentile)))
        baseline_revolutions = max(1, min(30, int(self.baseline_revolutions)))
        baseline_bin_degrees = max(1, min(45, int(self.baseline_bin_degrees)))
        change_threshold_mm = max(10, min(5000, int(self.change_threshold_mm)))
        stable_hold_seconds = max(1, min(300, int(self.stable_hold_seconds)))

        return VolumeControlConfig(
            enabled=self.enabled,
            mode=mode,
            min_distance_mm=min_distance,
            max_distance_mm=max_distance,
            min_volume_percent=low_volume,
            max_volume_percent=high_volume,
            sensitivity=sensitivity,
            angle_center_degrees=angle_center,
            angle_width_degrees=angle_width,
            distance_percentile=distance_percentile,
            baseline_revolutions=baseline_revolutions,
            baseline_bin_degrees=baseline_bin_degrees,
            change_threshold_mm=change_threshold_mm,
            stable_hold_seconds=stable_hold_seconds,
        )


@dataclass(frozen=True)
class DistanceReading:
    distance_mm: int | None = None
    message: str = ""
    changed_points: int = 0
    baseline_points: int = 0


def map_distance_to_volume_percent(distance_mm: int, config: VolumeControlConfig) -> int:
    config = config.normalized()
    distance = max(config.min_distance_mm, min(config.max_distance_mm, int(distance_mm)))
    ratio = (distance - config.min_distance_mm) / (config.max_distance_mm - config.min_distance_mm)
    ratio = 1 - ((1 - ratio) ** config.sensitivity)

    if config.mode == MODE_NEARER_LOUDER:
        ratio = 1 - ratio

    volume = config.min_volume_percent + ratio * (
        config.max_volume_percent - config.min_volume_percent
    )
    return int(round(volume))


def filter_distances_for_volume(distances, config: VolumeControlConfig) -> list[int]:
    config = config.normalized()
    return [
        int(distance)
        for distance in distances
        if config.min_distance_mm <= int(distance) <= config.max_distance_mm
    ]


def _angle_delta_degrees(angle: float, center: float) -> float:
    return abs((float(angle) - float(center) + 180) % 360 - 180)


def select_distance_for_volume(points, config: VolumeControlConfig) -> int | None:
    config = config.normalized()
    distance_window_points = [
        (int(distance), float(angle))
        for distance, angle in points
        if config.min_distance_mm <= int(distance) <= config.max_distance_mm
    ]

    if not distance_window_points:
        return None

    half_width = config.angle_width_degrees / 2
    angle_window_points = [
        point
        for point in distance_window_points
        if config.angle_width_degrees >= 360
        or _angle_delta_degrees(point[1], config.angle_center_degrees) <= half_width
    ]
    selected_points = angle_window_points or distance_window_points
    distances = sorted(point[0] for point in selected_points)
    percentile_index = math.ceil((len(distances) - 1) * config.distance_percentile / 100)
    return distances[percentile_index]


def _median_distance(distances: list[int]) -> int:
    values = sorted(distances)
    if not values:
        return 0
    return values[len(values) // 2]


class BaselineDistanceTracker:
    def __init__(self, config: VolumeControlConfig, clock=time.time):
        self.config = config.normalized()
        self.clock = clock
        self._baseline_samples = []
        self._baseline_by_bin: dict[int, int] = {}
        self._last_change_time = None

    @property
    def baseline_ready(self) -> bool:
        return bool(self._baseline_by_bin)

    def _bin_for_angle(self, angle: float) -> int:
        return int(float(angle) % 360 // self.config.baseline_bin_degrees)

    def _distances_by_bin(self, points) -> dict[int, list[int]]:
        distances_by_bin: dict[int, list[int]] = {}
        for distance, angle in points:
            distance = int(distance)
            if self.config.min_distance_mm <= distance <= self.config.max_distance_mm:
                distances_by_bin.setdefault(self._bin_for_angle(angle), []).append(distance)
        return distances_by_bin

    def _build_baseline(self):
        merged: dict[int, list[int]] = {}
        for sample in self._baseline_samples:
            for bin_index, distances in sample.items():
                merged.setdefault(bin_index, []).extend(distances)

        self._baseline_by_bin = {
            bin_index: _median_distance(distances)
            for bin_index, distances in merged.items()
            if distances
        }
        self._last_change_time = self.clock()

    def process_revolution(self, points) -> DistanceReading:
        distances_by_bin = self._distances_by_bin(points)

        if not self.baseline_ready:
            self._baseline_samples.append(distances_by_bin)
            if len(self._baseline_samples) >= self.config.baseline_revolutions:
                self._build_baseline()
                return DistanceReading(
                    message="baseline_ready",
                    baseline_points=len(self._baseline_by_bin),
                )
            return DistanceReading(
                message="baseline_collecting",
                baseline_points=len(distances_by_bin),
            )

        changed_points = []
        for bin_index, distances in distances_by_bin.items():
            current_distance = _median_distance(distances)
            baseline_distance = self._baseline_by_bin.get(bin_index)
            changed = (
                baseline_distance is None
                or abs(current_distance - baseline_distance) >= self.config.change_threshold_mm
            )
            if changed:
                angle = (bin_index + 0.5) * self.config.baseline_bin_degrees
                changed_points.append((current_distance, angle % 360))

        if changed_points:
            self._last_change_time = self.clock()
            baseline_config = replace(self.config, angle_width_degrees=360)
            return DistanceReading(
                distance_mm=select_distance_for_volume(changed_points, baseline_config),
                message="baseline_changed",
                changed_points=len(changed_points),
                baseline_points=len(self._baseline_by_bin),
            )

        now = self.clock()
        stable_for = now - self._last_change_time if self._last_change_time is not None else 0
        message = "baseline_stable" if stable_for >= self.config.stable_hold_seconds else "baseline_unchanged"
        return DistanceReading(
            message=message,
            baseline_points=len(self._baseline_by_bin),
        )


def discover_lidar_device(
    configured_device: str | None = None,
    glob_fn=glob.glob,
    path_exists_fn=Path.exists,
) -> str | None:
    configured_device = (configured_device or os.environ.get("LIDAR_DEVICE") or "").strip()
    if configured_device:
        return configured_device

    for pattern in LIDAR_DEVICE_PATTERNS:
        for candidate in sorted(glob_fn(pattern)):
            if path_exists_fn(Path(candidate)):
                return candidate

    return LIDAR_DEVICE if path_exists_fn(Path(LIDAR_DEVICE)) else None


class LidarDistanceReader:
    def __init__(
        self,
        device: str | None = None,
        baudrate: int = LIDAR_BAUDRATE,
        min_distance_mm: int = 1,
        max_distance_mm: int = 12000,
        angle_center_degrees: int = 90,
        angle_width_degrees: int = 70,
        distance_percentile: int = 50,
        baseline_revolutions: int = 3,
        baseline_bin_degrees: int = 5,
        change_threshold_mm: int = 200,
        stable_hold_seconds: int = 30,
    ):
        self.device = discover_lidar_device(device)
        self.baudrate = baudrate
        self.min_distance_mm = min_distance_mm
        self.max_distance_mm = max_distance_mm
        self.angle_center_degrees = angle_center_degrees
        self.angle_width_degrees = angle_width_degrees
        self.distance_percentile = distance_percentile
        self.config = VolumeControlConfig(
            min_distance_mm=min_distance_mm,
            max_distance_mm=max_distance_mm,
            angle_center_degrees=angle_center_degrees,
            angle_width_degrees=angle_width_degrees,
            distance_percentile=distance_percentile,
            baseline_revolutions=baseline_revolutions,
            baseline_bin_degrees=baseline_bin_degrees,
            change_threshold_mm=change_threshold_mm,
            stable_hold_seconds=stable_hold_seconds,
        ).normalized()

    def read_distances(self, stop_event: threading.Event):
        try:
            import serial
        except ImportError:
            print("[volume] pyserial is not installed; lidar volume control disabled")
            return

        if not self.device:
            print(
                "[volume] no lidar serial device found; checked "
                + ", ".join(LIDAR_DEVICE_PATTERNS)
            )
            return

        try:
            ser = serial.Serial(self.device, self.baudrate, timeout=1)
        except Exception as exc:
            print(f"[volume] unable to open lidar {self.device}: {exc}")
            return

        last_angle = 0
        circle_count = 0
        all_valid_points = []
        baseline_tracker = BaselineDistanceTracker(self.config)

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
                        if (
                            intensity >= MIN_VALID_INTENSITY
                            and self.min_distance_mm <= distance <= self.max_distance_mm
                        ):
                            all_valid_points.append((distance, angle))

                    if last_angle - start_angle > 100:
                        circle_count += 1
                        if circle_count % 3 == 0 and all_valid_points:
                            yield baseline_tracker.process_revolution(all_valid_points)
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
        status_reporter=None,
        clock=time.time,
    ):
        self.config = config.normalized()
        self.distance_reader = distance_reader or LidarDistanceReader(
            min_distance_mm=self.config.min_distance_mm,
            max_distance_mm=self.config.max_distance_mm,
            angle_center_degrees=self.config.angle_center_degrees,
            angle_width_degrees=self.config.angle_width_degrees,
            distance_percentile=self.config.distance_percentile,
            baseline_revolutions=self.config.baseline_revolutions,
            baseline_bin_degrees=self.config.baseline_bin_degrees,
            change_threshold_mm=self.config.change_threshold_mm,
            stable_hold_seconds=self.config.stable_hold_seconds,
        )
        self.sink = sink
        self.command_runner = command_runner
        self.status_reporter = status_reporter
        self.clock = clock
        self._last_status_report_time = None
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._run, daemon=True)

    def start(self):
        if self.config.enabled:
            self.thread.start()

    def stop(self):
        self.stop_event.set()
        if self.thread.is_alive():
            self.thread.join(timeout=1)
        self._report_status({"active": False, "message": "playback_stopped"}, force=True)

    def _set_volume(self, volume_percent: int):
        self.command_runner(
            ["pactl", "set-sink-volume", self.sink, f"{volume_percent}%"],
            check=False,
        )

    def _report_status(self, payload: dict, force: bool = False):
        if not self.status_reporter:
            return

        now = self.clock()
        if (
            not force
            and self._last_status_report_time is not None
            and now - self._last_status_report_time < 1
        ):
            return

        self._last_status_report_time = now
        status = {
            "updatedAt": int(now * 1000),
            "active": True,
            "mode": self.config.mode,
            "sink": self.sink,
            **payload,
        }

        try:
            self.status_reporter(status)
        except Exception as exc:
            print(f"[volume] unable to publish volume status: {exc}")

    def _run(self):
        if hasattr(self.distance_reader, "device") and self.distance_reader.device is None:
            self._report_status(
                {
                    "active": False,
                    "volumePercent": None,
                    "distanceMm": None,
                    "message": "no_lidar_serial_device",
                },
                force=True,
            )

        pending = queue.Queue(maxsize=1)
        for reading in self.distance_reader.read_distances(self.stop_event):
            if self.stop_event.is_set():
                return
            if isinstance(reading, DistanceReading):
                if reading.distance_mm is None:
                    self._report_status({
                        "active": True,
                        "distanceMm": None,
                        "volumePercent": None,
                        "message": reading.message,
                        "changedPoints": reading.changed_points,
                        "baselinePoints": reading.baseline_points,
                    })
                    continue
                distance = reading.distance_mm
                message = reading.message or "volume_set"
                changed_points = reading.changed_points
                baseline_points = reading.baseline_points
            else:
                distance = int(reading)
                message = "volume_set"
                changed_points = 0
                baseline_points = 0

            volume = map_distance_to_volume_percent(distance, self.config)
            if pending.full():
                try:
                    pending.get_nowait()
                except queue.Empty:
                    pass
            pending.put(volume)
            self._set_volume(volume)
            self._report_status({
                "active": True,
                "distanceMm": distance,
                "volumePercent": volume,
                "message": message,
                "changedPoints": changed_points,
                "baselinePoints": baseline_points,
            })
            print(f"[volume] distance_mm={distance} volume={volume}% mode={self.config.mode}")
