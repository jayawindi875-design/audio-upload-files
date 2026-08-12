import asyncio
import unittest

from consumer.livekit_receiver import (
    DelayedPcmBuffer,
    format_livekit_audio_frame,
    format_livekit_track_subscription,
    normalize_live_delay_seconds,
)


class DelayedPcmBufferTests(unittest.IsolatedAsyncioTestCase):
    async def test_emits_frames_only_after_the_selected_delay(self):
        now = [100.0]
        buffer = DelayedPcmBuffer(clock=lambda: now[0])
        buffer.push(b"first", delay_seconds=10)

        self.assertEqual(buffer.pop_due(), [])
        now[0] = 109.99
        self.assertEqual(buffer.pop_due(), [])
        now[0] = 110.0
        self.assertEqual(buffer.pop_due(), [b"first"])

    async def test_emits_due_frames_in_receive_order(self):
        now = [50.0]
        buffer = DelayedPcmBuffer(clock=lambda: now[0])
        buffer.push(b"first", delay_seconds=2)
        buffer.push(b"second", delay_seconds=2)
        now[0] = 52.0

        self.assertEqual(buffer.pop_due(), [b"first", b"second"])

    async def test_rejects_delay_outside_zero_to_sixty_seconds(self):
        self.assertEqual(normalize_live_delay_seconds(0), 0)
        self.assertEqual(normalize_live_delay_seconds("60"), 60)
        self.assertIsNone(normalize_live_delay_seconds(-1))
        self.assertIsNone(normalize_live_delay_seconds(61))
        self.assertIsNone(normalize_live_delay_seconds("1.5"))

    async def test_formats_non_sensitive_livekit_runtime_events(self):
        self.assertEqual(
            format_livekit_track_subscription("web-example", "audio"),
            "[livekit] subscribed identity=web-example kind=audio",
        )
        self.assertEqual(
            format_livekit_audio_frame("web-example", byte_count=1920, delay_seconds=10),
            "[livekit] first_audio_frame identity=web-example bytes=1920 delay_seconds=10",
        )


if __name__ == "__main__":
    unittest.main()
