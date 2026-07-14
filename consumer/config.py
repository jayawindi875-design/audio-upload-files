import os
from dataclasses import dataclass
from pathlib import Path


def _load_dotenv_if_available():
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    load_dotenv()


def _read_required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def _read_bool_env(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class ConsumerConfig:
    endpoint_url: str
    access_key_id: str
    secret_access_key: str
    bucket_name: str
    download_root: Path
    poll_interval_seconds: int
    player_command: str
    dry_run: bool

    @classmethod
    def from_env(cls) -> "ConsumerConfig":
        _load_dotenv_if_available()

        return cls(
            endpoint_url=_read_required_env("R2_ENDPOINT"),
            access_key_id=_read_required_env("R2_ACCESS_KEY_ID"),
            secret_access_key=_read_required_env("R2_SECRET_ACCESS_KEY"),
            bucket_name=_read_required_env("R2_BUCKET"),
            download_root=Path(
                os.environ.get("CONSUMER_DOWNLOAD_ROOT", "./runtime").strip() or "./runtime"
            ),
            poll_interval_seconds=int(os.environ.get("CONSUMER_POLL_INTERVAL", "10")),
            player_command=os.environ.get("CONSUMER_PLAYER_COMMAND", "").strip(),
            dry_run=_read_bool_env("CONSUMER_DRY_RUN", default=False),
        )
