from dataclasses import dataclass
from pathlib import Path


@dataclass
class ProcessResult:
    status: str
    processed_key: str
    local_path: Path | None = None


class QueueWorker:
    def __init__(self, r2_client, player, download_root: Path):
        self.r2_client = r2_client
        self.player = player
        self.download_root = Path(download_root)

    def process_next(self) -> ProcessResult:
        incoming_objects = self.r2_client.list_incoming_objects()

        if not incoming_objects:
            return ProcessResult(status="idle", processed_key="")

        next_object = sorted(
            incoming_objects,
            key=lambda item: (item.get("last_modified", 0), item.get("key", "")),
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
