import unittest

from consumer.live_stream import StreamingPlayer, create_app


class FakeStdin:
    def __init__(self):
        self.writes = []
        self.closed = False
        self.flush_count = 0

    def write(self, data):
        self.writes.append(data)

    def flush(self):
        self.flush_count += 1

    def close(self):
        self.closed = True


class FakeProcess:
    def __init__(self):
        self.stdin = FakeStdin()
        self.terminated = False
        self.waited = False

    def poll(self):
        return None

    def wait(self, timeout=None):
        self.waited = True
        return 0

    def terminate(self):
        self.terminated = True


class LiveStreamTests(unittest.TestCase):
    def test_streaming_player_writes_multiple_chunks_to_one_process(self):
        processes = []

        def fake_process_factory(command, shell, stdin):
            process = FakeProcess()
            processes.append((command, shell, stdin, process))
            return process

        player = StreamingPlayer("ffplay -i pipe:0", process_factory=fake_process_factory)

        player.write(b"first")
        player.write(b"second")
        player.stop()

        self.assertEqual(len(processes), 1)
        self.assertEqual(processes[0][0], "ffplay -i pipe:0")
        self.assertEqual(processes[0][1], True)
        self.assertEqual(processes[0][3].stdin.writes, [b"first", b"second"])
        self.assertEqual(processes[0][3].stdin.flush_count, 2)
        self.assertTrue(processes[0][3].stdin.closed)
        self.assertTrue(processes[0][3].waited)

    def test_live_stream_app_exposes_page_and_websocket_route(self):
        app = create_app()
        routes = {(route.method, route.resource.canonical) for route in app.router.routes()}

        self.assertIn(("GET", "/"), routes)
        self.assertIn(("GET", "/ws"), routes)


if __name__ == "__main__":
    unittest.main()
