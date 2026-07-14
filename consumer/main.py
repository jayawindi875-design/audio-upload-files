import argparse
import time

from consumer.config import ConsumerConfig
from consumer.player import build_player
from consumer.r2_client import R2QueueClient
from consumer.worker import QueueWorker


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


def run_consumer(run_once: bool = False):
    config = ConsumerConfig.from_env()
    worker = build_worker_from_env()

    while True:
        result = worker.process_next()
        print(f"[consumer] status={result.status} key={result.processed_key or '-'}")

        if run_once:
            return result

        time.sleep(config.poll_interval_seconds)


def parse_args():
    parser = argparse.ArgumentParser(description="Poll Cloudflare R2 and consume uploaded audio files.")
    parser.add_argument("--once", action="store_true", help="Process at most one object and exit.")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run_consumer(run_once=args.once)
