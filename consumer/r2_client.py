from pathlib import Path
import json
import time


VOLUME_CONFIG_KEY = "config/volume-control.json"
VOLUME_STATUS_KEY = "status/volume-control.json"


class R2QueueClient:
    def __init__(
        self,
        endpoint_url: str,
        access_key_id: str,
        secret_access_key: str,
        bucket_name: str,
        volume_config_cache_seconds: float = 30,
        clock=time.time,
    ):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required to run the consumer.") from exc

        self.bucket_name = bucket_name
        self.volume_config_cache_seconds = volume_config_cache_seconds
        self._clock = clock
        self._volume_config_cache = None
        self._volume_config_cache_time = 0
        self.client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key_id,
            aws_secret_access_key=secret_access_key,
            region_name="auto",
        )

    def list_incoming_objects(self):
        response = self.client.list_objects_v2(Bucket=self.bucket_name, Prefix="incoming/")
        contents = response.get("Contents", [])

        return [
            {
                "key": item["Key"],
                "last_modified": item["LastModified"].timestamp(),
                "size": item.get("Size", 0),
            }
            for item in contents
            if item["Key"] != "incoming/"
        ]

    def download_object(self, key: str, destination: Path):
        destination.parent.mkdir(parents=True, exist_ok=True)
        self.client.download_file(self.bucket_name, key, str(destination))

    def move_object(self, source_key: str, destination_key: str):
        copy_source = {"Bucket": self.bucket_name, "Key": source_key}
        self.client.copy_object(
            Bucket=self.bucket_name,
            CopySource=copy_source,
            Key=destination_key,
        )
        self.client.delete_object(Bucket=self.bucket_name, Key=source_key)

    def get_volume_config(self):
        now = self._clock()
        if (
            self._volume_config_cache is not None
            and now - self._volume_config_cache_time < self.volume_config_cache_seconds
        ):
            return self._volume_config_cache

        try:
            response = self.client.get_object(Bucket=self.bucket_name, Key=VOLUME_CONFIG_KEY)
        except Exception as exc:
            response_code = getattr(exc, "response", {}).get("Error", {}).get("Code")
            if response_code in {"NoSuchKey", "404"}:
                return None
            print(f"[volume] unable to read volume config: {exc}")
            return None

        body = response["Body"].read().decode("utf-8")
        self._volume_config_cache = json.loads(body)
        self._volume_config_cache_time = now
        return self._volume_config_cache

    def put_volume_status(self, status: dict):
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=VOLUME_STATUS_KEY,
            Body=json.dumps(status),
            ContentType="application/json",
        )
