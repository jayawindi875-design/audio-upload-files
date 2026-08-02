import unittest
from unittest.mock import patch

from consumer.volume_control import (
    BaselineDistanceTracker,
    DistanceReading,
    VolumeControlConfig,
    discover_lidar_device,
    filter_distances_for_volume,
    map_distance_to_volume_percent,
    select_distance_for_volume,
)


class VolumeControlTests(unittest.TestCase):
    def test_farther_louder_maps_near_to_min_and_far_to_max(self):
        config = VolumeControlConfig(
            min_distance_mm=200,
            max_distance_mm=1000,
            min_volume_percent=20,
            max_volume_percent=80,
            mode="farther_louder",
            sensitivity=1.0,
        )

        self.assertEqual(map_distance_to_volume_percent(200, config), 20)
        self.assertEqual(map_distance_to_volume_percent(1000, config), 80)
        self.assertEqual(map_distance_to_volume_percent(600, config), 50)

    def test_nearer_louder_reverses_the_volume_curve(self):
        config = VolumeControlConfig(
            min_distance_mm=200,
            max_distance_mm=1000,
            min_volume_percent=20,
            max_volume_percent=80,
            mode="nearer_louder",
            sensitivity=1.0,
        )

        self.assertEqual(map_distance_to_volume_percent(200, config), 80)
        self.assertEqual(map_distance_to_volume_percent(1000, config), 20)

    def test_clamps_distance_and_orders_volume_bounds(self):
        config = VolumeControlConfig(
            min_distance_mm=200,
            max_distance_mm=1000,
            min_volume_percent=90,
            max_volume_percent=30,
            mode="farther_louder",
        ).normalized()

        self.assertEqual(config.min_volume_percent, 30)
        self.assertEqual(config.max_volume_percent, 90)
        self.assertEqual(map_distance_to_volume_percent(50, config), 30)
        self.assertEqual(map_distance_to_volume_percent(1200, config), 90)

    def test_builds_config_from_developer_payload(self):
        config = VolumeControlConfig.from_dict(
            {
                "enabled": True,
                "mode": "nearer_louder",
                "minDistanceMm": "300",
                "maxDistanceMm": "2500",
                "minVolumePercent": "15",
                "maxVolumePercent": "65",
                "sensitivity": "1.8",
            }
        )

        self.assertTrue(config.enabled)
        self.assertEqual(config.mode, "nearer_louder")
        self.assertEqual(config.min_distance_mm, 300)
        self.assertEqual(config.max_distance_mm, 2500)
        self.assertEqual(config.min_volume_percent, 15)
        self.assertEqual(config.max_volume_percent, 65)
        self.assertEqual(config.sensitivity, 1.8)

    def test_builds_radar_selection_config_from_developer_payload(self):
        config = VolumeControlConfig.from_dict(
            {
                "angleCenterDegrees": "90",
                "angleWidthDegrees": "50",
                "distancePercentile": "40",
                "baselineRevolutions": "2",
                "baselineBinDegrees": "10",
                "changeThresholdMm": "180",
                "stableHoldSeconds": "30",
            }
        )

        self.assertEqual(config.angle_center_degrees, 90)
        self.assertEqual(config.angle_width_degrees, 50)
        self.assertEqual(config.distance_percentile, 40)
        self.assertEqual(config.baseline_revolutions, 2)
        self.assertEqual(config.baseline_bin_degrees, 10)
        self.assertEqual(config.change_threshold_mm, 180)
        self.assertEqual(config.stable_hold_seconds, 30)

    def test_baseline_tracker_collects_then_detects_changed_obstacle(self):
        config = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2500,
            baseline_revolutions=2,
            baseline_bin_degrees=10,
            change_threshold_mm=200,
            stable_hold_seconds=30,
        )
        tracker = BaselineDistanceTracker(config, clock=lambda: 100)

        self.assertEqual(
            tracker.process_revolution([(1000, 0), (1200, 90), (1400, 180)]).message,
            "baseline_collecting",
        )
        self.assertEqual(
            tracker.process_revolution([(1000, 0), (1200, 90), (1400, 180)]).message,
            "baseline_ready",
        )

        reading = tracker.process_revolution([(1000, 0), (700, 90), (1400, 180)])

        self.assertIsInstance(reading, DistanceReading)
        self.assertEqual(reading.distance_mm, 700)
        self.assertEqual(reading.message, "baseline_changed")

    def test_baseline_tracker_holds_volume_after_static_scene(self):
        config = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2500,
            baseline_revolutions=1,
            baseline_bin_degrees=10,
            change_threshold_mm=200,
            stable_hold_seconds=30,
        )
        times = iter([0, 5, 35, 36])
        tracker = BaselineDistanceTracker(config, clock=lambda: next(times))

        tracker.process_revolution([(1000, 0), (1200, 90)])
        self.assertIsNone(tracker.process_revolution([(1010, 0), (1210, 90)]).distance_mm)
        self.assertEqual(
            tracker.process_revolution([(1010, 0), (1210, 90)]).message,
            "baseline_stable",
        )
        self.assertEqual(
            tracker.process_revolution([(1000, 0), (800, 90)]).distance_mm,
            800,
        )

    def test_filters_out_distances_outside_the_configured_window(self):
        config = VolumeControlConfig(min_distance_mm=400, max_distance_mm=2500)

        self.assertEqual(
            filter_distances_for_volume([188, 221, 900, 2600], config),
            [900],
        )

    def test_selects_stable_distance_inside_angle_window(self):
        config = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2500,
            angle_center_degrees=90,
            angle_width_degrees=40,
            distance_percentile=50,
        )

        self.assertEqual(
            select_distance_for_volume(
                [
                    (430, 15),
                    (900, 75),
                    (1100, 90),
                    (1300, 105),
                    (2100, 180),
                ],
                config,
            ),
            1100,
        )

    def test_angle_window_wraps_across_zero_degrees(self):
        config = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2500,
            angle_center_degrees=0,
            angle_width_degrees=40,
            distance_percentile=50,
        )

        self.assertEqual(
            select_distance_for_volume([(800, 350), (1000, 5), (2200, 90)], config),
            1000,
        )

    def test_falls_back_to_full_distance_window_when_angle_window_is_empty(self):
        config = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2500,
            angle_center_degrees=0,
            angle_width_degrees=20,
            distance_percentile=50,
        )

        self.assertEqual(select_distance_for_volume([(900, 90), (1300, 120)], config), 1300)

    def test_higher_sensitivity_makes_middle_distance_changes_more_obvious(self):
        linear = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2400,
            min_volume_percent=20,
            max_volume_percent=100,
            mode="farther_louder",
            sensitivity=1.0,
        )
        sensitive = VolumeControlConfig(
            min_distance_mm=400,
            max_distance_mm=2400,
            min_volume_percent=20,
            max_volume_percent=100,
            mode="farther_louder",
            sensitivity=2.0,
        )

        self.assertEqual(map_distance_to_volume_percent(1400, linear), 60)
        self.assertEqual(map_distance_to_volume_percent(1400, sensitive), 80)

    def test_discovers_lidar_device_from_environment_override(self):
        with patch.dict("os.environ", {"LIDAR_DEVICE": "/dev/custom-lidar"}):
            self.assertEqual(discover_lidar_device(), "/dev/custom-lidar")

    def test_discovers_first_existing_serial_device(self):
        candidates = {
            "/dev/serial/by-id/a-lidar": True,
            "/dev/ttyACM0": True,
            "/dev/ttyUSB0": True,
        }

        def fake_glob(pattern):
            return {
                "/dev/serial/by-id/*": ["/dev/serial/by-id/a-lidar"],
                "/dev/ttyACM*": ["/dev/ttyACM0"],
                "/dev/ttyUSB*": ["/dev/ttyUSB0"],
            }.get(pattern, [])

        def fake_exists(path):
            return candidates.get(path.as_posix(), False)

        with patch.dict("os.environ", {}, clear=True):
            self.assertEqual(
                discover_lidar_device(glob_fn=fake_glob, path_exists_fn=fake_exists),
                "/dev/serial/by-id/a-lidar",
            )

    def test_returns_none_when_no_lidar_device_exists(self):
        with patch.dict("os.environ", {}, clear=True):
            self.assertIsNone(
                discover_lidar_device(
                    glob_fn=lambda pattern: [],
                    path_exists_fn=lambda path: False,
                )
            )

    def test_volume_controller_reports_status_at_one_second_rate(self):
        from consumer.volume_control import LidarVolumeController

        class FakeDistanceReader:
            def read_distances(self, stop_event):
                yield 400
                yield DistanceReading(distance_mm=None, message="baseline_stable")
                yield 1400

        clock_values = iter([100.0, 100.2, 101.0, 102.0])
        status_updates = []

        controller = LidarVolumeController(
            VolumeControlConfig(
                min_distance_mm=400,
                max_distance_mm=1400,
                min_volume_percent=10,
                max_volume_percent=110,
                sensitivity=1.0,
            ),
            distance_reader=FakeDistanceReader(),
            command_runner=lambda command, check: None,
            status_reporter=status_updates.append,
            clock=lambda: next(clock_values),
        )

        controller._run()

        self.assertEqual(
            [item["volumePercent"] for item in status_updates],
            [10, 110],
        )
        self.assertEqual(status_updates[0]["distanceMm"], 400)
        self.assertEqual(status_updates[1]["distanceMm"], 1400)


if __name__ == "__main__":
    unittest.main()
