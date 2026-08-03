import unittest

from consumer.live_stream import (
    PAGE_HTML,
    StreamingPlayer,
    create_handler,
    read_ws_frame,
    websocket_accept_key,
)


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

    def test_builds_websocket_accept_key(self):
        self.assertEqual(
            websocket_accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
            "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=",
        )

    def test_live_stream_page_uses_websocket_endpoint(self):
        self.assertIn("/ws", PAGE_HTML)
        self.assertIn("手机麦克风", PAGE_HTML)

    def test_configures_handler_with_player_command(self):
        handler = create_handler("custom-player -i pipe:0")

        self.assertEqual(handler.player_command, "custom-player -i pipe:0")

    def test_reads_masked_binary_websocket_frame(self):
        class FakeSocket:
            def __init__(self, data):
                self.data = bytearray(data)

            def recv(self, size):
                chunk = self.data[:size]
                del self.data[:size]
                return bytes(chunk)

        payload = b"abc"
        mask = b"\x01\x02\x03\x04"
        masked_payload = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        frame = b"\x82" + bytes([0x80 | len(payload)]) + mask + masked_payload

        opcode, data = read_ws_frame(FakeSocket(frame))

        self.assertEqual(opcode, 0x2)
        self.assertEqual(data, payload)


if __name__ == "__main__":
    unittest.main()
