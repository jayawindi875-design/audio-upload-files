import os
import tempfile
import unittest
from pathlib import Path

from consumer.config import ConsumerConfig
from consumer.player import CommandPlayer, NoopPlayer, build_player


class RuntimeTests(unittest.TestCase):
    def test_loads_consumer_config_from_environment(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            original_env = os.environ.copy()
            try:
                os.environ.update(
                    {
                        "R2_ENDPOINT": "https://example.r2.cloudflarestorage.com",
                        "R2_ACCESS_KEY_ID": "abc",
                        "R2_SECRET_ACCESS_KEY": "def",
                        "R2_BUCKET": "audio-upload-files",
                        "CONSUMER_DOWNLOAD_ROOT": temp_dir,
                        "CONSUMER_POLL_INTERVAL": "9",
                        "CONSUMER_DRY_RUN": "true",
                        "CONSUMER_SKIP_DOTENV": "true",
                    }
                )

                config = ConsumerConfig.from_env()
            finally:
                os.environ.clear()
                os.environ.update(original_env)

        self.assertEqual(config.bucket_name, "audio-upload-files")
        self.assertEqual(config.poll_interval_seconds, 9)
        self.assertEqual(config.download_root, Path(temp_dir))
        self.assertEqual(config.dry_run, True)

    def test_requires_essential_r2_configuration(self):
        original_env = os.environ.copy()
        try:
            for key in [
                "R2_ENDPOINT",
                "R2_ACCESS_KEY_ID",
                "R2_SECRET_ACCESS_KEY",
                "R2_BUCKET",
            ]:
                os.environ.pop(key, None)

            os.environ["CONSUMER_SKIP_DOTENV"] = "true"

            with self.assertRaises(ValueError):
                ConsumerConfig.from_env()
        finally:
            os.environ.clear()
            os.environ.update(original_env)

    def test_builds_noop_player_in_dry_run_mode(self):
        player = build_player(command="", dry_run=True)

        self.assertIsInstance(player, NoopPlayer)

    def test_command_player_runs_lidar_volume_controller_around_playback(self):
        events = []

        class FakeController:
            def __init__(self, config):
                self.config = config

            def start(self):
                events.append(("start", self.config.mode))

            def stop(self):
                events.append(("stop", self.config.mode))

        def fake_run(command, shell, check):
            events.append(("play", command, shell, check))

            class Completed:
                returncode = 0

            return Completed()

        player = CommandPlayer(
            "ffplay -nodisp -autoexit",
            command_runner=fake_run,
            volume_controller_factory=FakeController,
        )

        played = player.play(Path("/tmp/test.mp3"), volume_config={"mode": "nearer_louder"})

        self.assertTrue(played)
        self.assertEqual(events[0], ("start", "nearer_louder"))
        self.assertEqual(events[-1], ("stop", "nearer_louder"))
        self.assertIn("test.mp3", events[1][1])


if __name__ == "__main__":
    unittest.main()
