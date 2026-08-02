import subprocess
from pathlib import Path

from consumer.volume_control import LidarVolumeController, VolumeControlConfig


class NoopPlayer:
    def play(self, file_path: Path, volume_config=None, volume_status_reporter=None) -> bool:
        print(f"[dry-run] skip playback for {file_path}")
        return True


class CommandPlayer:
    def __init__(
        self,
        command: str,
        command_runner=subprocess.run,
        volume_controller_factory=LidarVolumeController,
    ):
        if not command.strip():
            raise ValueError("Playback command cannot be empty.")
        self.command = command
        self.command_runner = command_runner
        self.volume_controller_factory = volume_controller_factory

    def play(self, file_path: Path, volume_config=None, volume_status_reporter=None) -> bool:
        controller = None
        if volume_config:
            controller_config = VolumeControlConfig.from_dict(volume_config)
            if controller_config.enabled:
                try:
                    controller = self.volume_controller_factory(
                        controller_config,
                        status_reporter=volume_status_reporter,
                    )
                except TypeError:
                    controller = self.volume_controller_factory(controller_config)

        try:
            if controller:
                controller.start()
            completed = self.command_runner(
                f'{self.command} "{file_path}"',
                shell=True,
                check=False,
            )
            return completed.returncode == 0
        finally:
            if controller:
                controller.stop()


def build_player(command: str, dry_run: bool):
    if dry_run:
        return NoopPlayer()
    return CommandPlayer(command)
