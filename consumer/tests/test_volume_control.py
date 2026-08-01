import unittest

from consumer.volume_control import (
    VolumeControlConfig,
    filter_distances_for_volume,
    map_distance_to_volume_percent,
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

    def test_filters_out_distances_outside_the_configured_window(self):
        config = VolumeControlConfig(min_distance_mm=400, max_distance_mm=2500)

        self.assertEqual(
            filter_distances_for_volume([188, 221, 900, 2600], config),
            [900],
        )

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


if __name__ == "__main__":
    unittest.main()
