import subprocess
from pathlib import Path


class NoopPlayer:
    def play(self, file_path: Path) -> bool:
        print(f"[dry-run] skip playback for {file_path}")
        return True


class CommandPlayer:
    def __init__(self, command: str):
        if not command.strip():
            raise ValueError("Playback command cannot be empty.")
        self.command = command

    def play(self, file_path: Path) -> bool:
        completed = subprocess.run(
            f'{self.command} "{file_path}"',
            shell=True,
            check=False,
        )
        return completed.returncode == 0


def build_player(command: str, dry_run: bool):
    if dry_run:
        return NoopPlayer()
    return CommandPlayer(command)
