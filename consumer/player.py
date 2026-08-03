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
        self._volume_controller = None
        self._volume_controller_signature = None

    def _build_volume_controller(self, volume_config, volume_status_reporter=None):
        if not volume_config:
            return None, None

        controller_config = VolumeControlConfig.from_dict(volume_config)
        if not controller_config.enabled:
            return None, None

        signature = (
            controller_config,
            id(volume_status_reporter),
        )
        try:
            controller = self.volume_controller_factory(
                controller_config,
                status_reporter=volume_status_reporter,
            )
        except TypeError:
            controller = self.volume_controller_factory(controller_config)
        return controller, signature

    def _ensure_volume_controller(self, volume_config, volume_status_reporter=None):
        controller, signature = self._build_volume_controller(
            volume_config,
            volume_status_reporter=volume_status_reporter,
        )

        if signature is None:
            self.close()
            return

        if self._volume_controller_signature == signature and self._volume_controller:
            return

        self.close()
        self._volume_controller = controller
        self._volume_controller_signature = signature
        self._volume_controller.start()

    def close(self):
        if self._volume_controller:
            self._volume_controller.stop()
        self._volume_controller = None
        self._volume_controller_signature = None

    def play(self, file_path: Path, volume_config=None, volume_status_reporter=None) -> bool:
        self._ensure_volume_controller(
            volume_config,
            volume_status_reporter=volume_status_reporter,
        )
        completed = self.command_runner(
            f'{self.command} "{file_path}"',
            shell=True,
            check=False,
        )
        return completed.returncode == 0


def build_player(command: str, dry_run: bool):
    if dry_run:
        return NoopPlayer()
    return CommandPlayer(command)
