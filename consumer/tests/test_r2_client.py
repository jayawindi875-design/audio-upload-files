import json
import unittest

from consumer.r2_client import R2QueueClient, VOLUME_CONFIG_KEY


class FakeBody:
    def __init__(self, payload):
        self.payload = payload

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class FakeS3Client:
    def __init__(self):
        self.calls = []

    def get_object(self, Bucket, Key):
        self.calls.append((Bucket, Key))
        return {"Body": FakeBody({"mode": "nearer_louder"})}


class R2ClientTests(unittest.TestCase):
    def test_caches_volume_config_within_ttl(self):
        fake_s3 = FakeS3Client()
        client = R2QueueClient.__new__(R2QueueClient)
        client.bucket_name = "audio-upload-files"
        client.client = fake_s3
        client.volume_config_cache_seconds = 30
        client._volume_config_cache = None
        client._volume_config_cache_time = 0
        client._clock = lambda: 100

        first = client.get_volume_config()
        second = client.get_volume_config()

        self.assertEqual(first, {"mode": "nearer_louder"})
        self.assertEqual(second, {"mode": "nearer_louder"})
        self.assertEqual(fake_s3.calls, [("audio-upload-files", VOLUME_CONFIG_KEY)])


if __name__ == "__main__":
    unittest.main()
