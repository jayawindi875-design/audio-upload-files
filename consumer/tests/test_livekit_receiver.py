import asyncio
import unittest

from consumer.livekit_receiver import (
    DelayedPcmBuffer,
    LiveKitAudioReceiver,
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

    async def test_discards_delayed_audio_when_its_call_is_replaced(self):
        now = [50.0]
        old_source = ("web-old", "TR_old")
        new_source = ("web-new", "TR_new")
        buffer = DelayedPcmBuffer(clock=lambda: now[0])
        buffer.push(b"old", delay_seconds=10, source=old_source)
        buffer.push(b"new", delay_seconds=10, source=new_source)

        buffer.discard_source(old_source)
        now[0] = 60.0

        self.assertEqual(buffer.pop_due(), [b"new"])

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


class LiveKitAudioReceiverSubscriptionTests(unittest.TestCase):
    def test_keeps_only_the_latest_audio_track_for_the_entire_installation(self):
        receiver = LiveKitAudioReceiver(
            url="wss://example.livekit.cloud",
            api_key="test-key",
            api_secret="test-secret",
        )
        begin = getattr(receiver, "_activate_audio_subscription", lambda *_: ("missing", None))
        finish = getattr(receiver, "_finish_audio_subscription", lambda *_: False)

        self.assertEqual(begin("web-example", "TR_first"), (True, None))
        self.assertEqual(begin("web-example", "TR_first"), (False, None))
        self.assertEqual(begin("web-reconnected", "TR_reconnected"), (True, ("web-example", "TR_first")))
        self.assertFalse(finish("web-example", "TR_first"))
        self.assertTrue(finish("web-reconnected", "TR_reconnected"))


if __name__ == "__main__":
    unittest.main()
