from pathlib import Path


class R2QueueClient:
    def __init__(self, endpoint_url: str, access_key_id: str, secret_access_key: str, bucket_name: str):
        try:
            import boto3
        except ImportError as exc:
            raise RuntimeError("boto3 is required to run the consumer.") from exc

        self.bucket_name = bucket_name
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
