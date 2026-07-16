import tempfile
import unittest
from pathlib import Path

from consumer.worker import QueueWorker


class FakeR2Client:
    def __init__(self, objects=None, fail_download=False):
        self.objects = list(objects or [])
        self.download_calls = []
        self.move_calls = []
        self.fail_download = fail_download

    def list_incoming_objects(self):
        return list(self.objects)

    def download_object(self, key, destination):
        self.download_calls.append((key, destination))
        if self.fail_download:
            raise RuntimeError("download failed")
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(b"audio-data")

    def move_object(self, source_key, destination_key):
        self.move_calls.append((source_key, destination_key))


class FakePlayer:
    def __init__(self, should_succeed=True):
        self.should_succeed = should_succeed
        self.play_calls = []

    def play(self, file_path):
        self.play_calls.append(file_path)
        return self.should_succeed


class QueueWorkerTests(unittest.TestCase):
    def test_returns_idle_when_queue_is_empty(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            worker = QueueWorker(
                r2_client=FakeR2Client(),
                player=FakePlayer(),
                download_root=Path(temp_dir),
            )

            result = worker.process_next()

        self.assertEqual(result.status, "idle")
        self.assertEqual(result.processed_key, "")

    def test_moves_processed_file_to_played_prefix_after_success(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[
                    {"key": "incoming/100-song-a.mp3", "last_modified": 100},
                    {"key": "incoming/200-song-b.mp3", "last_modified": 200},
                ]
            )
            player = FakePlayer(should_succeed=True)
            worker = QueueWorker(
                r2_client=r2_client,
                player=player,
                download_root=Path(temp_dir),
            )

            result = worker.process_next()

        self.assertEqual(result.status, "played")
        self.assertEqual(result.processed_key, "incoming/100-song-a.mp3")
        self.assertEqual(len(r2_client.download_calls), 1)
        self.assertEqual(r2_client.download_calls[0][0], "incoming/100-song-a.mp3")
        self.assertEqual(
            r2_client.move_calls,
            [("incoming/100-song-a.mp3", "played/100-song-a.mp3")],
        )
        self.assertEqual(len(player.play_calls), 1)

    def test_moves_failed_file_to_failed_prefix_when_player_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[{"key": "incoming/100-song-a.mp3", "last_modified": 100}]
            )
            player = FakePlayer(should_succeed=False)
            worker = QueueWorker(
                r2_client=r2_client,
                player=player,
                download_root=Path(temp_dir),
            )

            result = worker.process_next()

        self.assertEqual(result.status, "failed")
        self.assertEqual(
            r2_client.move_calls,
            [("incoming/100-song-a.mp3", "failed/100-song-a.mp3")],
        )

    def test_keeps_source_object_untouched_when_download_fails(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[{"key": "incoming/100-song-a.mp3", "last_modified": 100}],
                fail_download=True,
            )
            player = FakePlayer(should_succeed=True)
            worker = QueueWorker(
                r2_client=r2_client,
                player=player,
                download_root=Path(temp_dir),
            )

            with self.assertRaises(RuntimeError):
                worker.process_next()

        self.assertEqual(r2_client.move_calls, [])
        self.assertEqual(player.play_calls, [])

    def test_waits_without_downloading_when_all_recordings_are_scheduled_for_the_future(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[
                    {
                        "key": "incoming/1784190400000-1784190300000-recording.webm",
                        "last_modified": 1784190300,
                    }
                ]
            )
            player = FakePlayer()
            worker = QueueWorker(
                r2_client=r2_client,
                player=player,
                download_root=Path(temp_dir),
                now_ms=lambda: 1784190399999,
            )

            result = worker.process_next()

        self.assertEqual(result.status, "waiting")
        self.assertEqual(result.processed_key, "")
        self.assertEqual(r2_client.download_calls, [])
        self.assertEqual(player.play_calls, [])

    def test_plays_the_earliest_due_schedule_even_when_upload_order_differs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[
                    {
                        "key": "incoming/1784190400000-1784190200000-later.webm",
                        "last_modified": 100,
                    },
                    {
                        "key": "incoming/1784190350000-1784190300000-earlier.webm",
                        "last_modified": 200,
                    },
                ]
            )
            worker = QueueWorker(
                r2_client=r2_client,
                player=FakePlayer(),
                download_root=Path(temp_dir),
                now_ms=lambda: 1784190500000,
            )

            result = worker.process_next()

        self.assertEqual(
            result.processed_key,
            "incoming/1784190350000-1784190300000-earlier.webm",
        )

    def test_treats_legacy_object_keys_as_immediately_due(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            r2_client = FakeR2Client(
                objects=[{"key": "incoming/1784003102726-old-recording.m4a", "last_modified": 100}]
            )
            worker = QueueWorker(
                r2_client=r2_client,
                player=FakePlayer(),
                download_root=Path(temp_dir),
                now_ms=lambda: 0,
            )

            result = worker.process_next()

        self.assertEqual(result.status, "played")
        self.assertEqual(result.processed_key, "incoming/1784003102726-old-recording.m4a")


if __name__ == "__main__":
    unittest.main()
