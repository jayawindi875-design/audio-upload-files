from dataclasses import dataclass
from pathlib import Path
import re
import time


SCHEDULED_KEY_PATTERN = re.compile(r"^incoming/(\d{13})-\d{13}-.+")


def parse_scheduled_play_at(key: str) -> int | None:
    match = SCHEDULED_KEY_PATTERN.match(str(key or ""))
    return int(match.group(1)) if match else None


@dataclass
class ProcessResult:
    status: str
    processed_key: str
    local_path: Path | None = None


class QueueWorker:
    def __init__(self, r2_client, player, download_root: Path, now_ms=None):
        self.r2_client = r2_client
        self.player = player
        self.download_root = Path(download_root)
        self.now_ms = now_ms or (lambda: int(time.time() * 1000))

    def process_next(self) -> ProcessResult:
        incoming_objects = self.r2_client.list_incoming_objects()

        if not incoming_objects:
            return ProcessResult(status="idle", processed_key="")

        current_time_ms = self.now_ms()
        due_objects = []

        for item in incoming_objects:
            play_at = parse_scheduled_play_at(item.get("key", ""))
            if play_at is None or play_at <= current_time_ms:
                due_objects.append((play_at, item))

        if not due_objects:
            return ProcessResult(status="waiting", processed_key="")

        _, next_object = sorted(
            due_objects,
            key=lambda entry: (
                entry[0] if entry[0] is not None else entry[1].get("last_modified", 0) * 1000,
                entry[1].get("key", ""),
            ),
        )[0]

        source_key = next_object["key"]
        file_name = source_key.split("/", 1)[-1]
        local_path = self.download_root / "incoming" / file_name

        self.r2_client.download_object(source_key, local_path)
        played_successfully = self.player.play(local_path)

        destination_prefix = "played" if played_successfully else "failed"
        destination_key = f"{destination_prefix}/{file_name}"
        self.r2_client.move_object(source_key, destination_key)

        status = "played" if played_successfully else "failed"
        return ProcessResult(status=status, processed_key=source_key, local_path=local_path)
