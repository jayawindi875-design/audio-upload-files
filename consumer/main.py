import argparse
import asyncio
import os
import time
from pathlib import Path

from dotenv import load_dotenv

from consumer.config import ConsumerConfig
from consumer.player import build_player
from consumer.r2_client import R2QueueClient
from consumer.worker import QueueWorker
from consumer.livekit_receiver import build_receiver_from_env


def build_worker_from_env() -> QueueWorker:
    config = ConsumerConfig.from_env()
    r2_client = R2QueueClient(
        endpoint_url=config.endpoint_url,
        access_key_id=config.access_key_id,
        secret_access_key=config.secret_access_key,
        bucket_name=config.bucket_name,
    )
    player = build_player(config.player_command, config.dry_run)
    return QueueWorker(
        r2_client=r2_client,
        player=player,
        download_root=config.download_root,
    )


def run_consumer_loop(worker: QueueWorker, poll_interval_seconds: int, sleep_fn=time.sleep):
    while True:
        result = worker.process_next()
        print(f"[consumer] status={result.status} key={result.processed_key or '-'}")

        if result.status not in {"played", "failed"}:
            sleep_fn(poll_interval_seconds)


def run_consumer(run_once: bool = False):
    config = ConsumerConfig.from_env()
    worker = build_worker_from_env()

    if run_once:
        result = worker.process_next()
        print(f"[consumer] status={result.status} key={result.processed_key or '-'}")
        return result

    run_consumer_loop(worker, config.poll_interval_seconds)


def build_volume_services_from_env():
    """Reuse the existing R2 volume config/status channel when it is configured."""
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
    r2_names = ("R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET")
    if not all(os.environ.get(name, "").strip() for name in r2_names):
        return None, None, None
    config = ConsumerConfig.from_env()
    r2_client = R2QueueClient(
        endpoint_url=config.endpoint_url,
        access_key_id=config.access_key_id,
        secret_access_key=config.secret_access_key,
        bucket_name=config.bucket_name,
    )
    return (
        r2_client.get_volume_config(),
        r2_client.put_volume_status,
        r2_client.get_volume_config,
    )


def run_livekit_receiver():
    volume_config, volume_status_reporter, volume_config_provider = build_volume_services_from_env()
    receiver = build_receiver_from_env(
        volume_config=volume_config,
        volume_status_reporter=volume_status_reporter,
        volume_config_provider=volume_config_provider,
    )
    asyncio.run(receiver.run())


def parse_args():
    parser = argparse.ArgumentParser(description="Run the LiveKit one-way audio receiver on Raspberry Pi.")
    parser.add_argument("--once", action="store_true", help="Process at most one object and exit.")
    parser.add_argument("--legacy-r2", action="store_true", help="Use the legacy R2 recording queue instead.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    if args.legacy_r2:
        run_consumer(run_once=args.once)
    else:
        run_livekit_receiver()
