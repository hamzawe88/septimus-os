"""Local voice (Whisper STT / Piper TTS) — contract + graceful degradation.

The engines are heavy and optional. What must hold without them installed:
the module imports, the sidecar keeps booting, and every entry point returns a
clean (result, error_code) tuple instead of raising. The tests mock the engines
so they run on the py3.9 CI venv with neither model present.
"""
import os
import sys
import unittest
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import voice_local


class TestVoiceForLang(unittest.TestCase):
    def test_arabic_maps_to_arabic_voice(self):
        self.assertEqual(voice_local.voice_for_lang("ar"), voice_local.PIPER_VOICE_AR)
        self.assertIn("ar_", voice_local.PIPER_VOICE_AR)

    def test_non_arabic_maps_to_english_voice(self):
        self.assertEqual(voice_local.voice_for_lang("en"), voice_local.PIPER_VOICE_EN)


class TestTranscribeDegradation(unittest.TestCase):
    def setUp(self):
        voice_local._whisper_model = None

    def test_unavailable_when_engine_missing(self):
        with patch.object(voice_local, "_get_whisper", return_value=None):
            text, err = voice_local.transcribe(b"audio-bytes", "ar")
        self.assertIsNone(text)
        self.assertEqual(err, "unavailable")

    def test_returns_text_on_success(self):
        seg = MagicMock()
        seg.text = "  مرحبا بك  "
        model = MagicMock()
        model.transcribe.return_value = ([seg], MagicMock())
        with patch.object(voice_local, "_get_whisper", return_value=model):
            text, err = voice_local.transcribe(b"audio-bytes", "ar")
        self.assertIsNone(err)
        self.assertEqual(text, "مرحبا بك")
        # An explicit language hint is forwarded to the model.
        _, kwargs = model.transcribe.call_args
        self.assertEqual(kwargs.get("language"), "ar")

    def test_failed_when_engine_raises(self):
        model = MagicMock()
        model.transcribe.side_effect = RuntimeError("boom")
        with patch.object(voice_local, "_get_whisper", return_value=model):
            text, err = voice_local.transcribe(b"audio-bytes", "ar")
        self.assertIsNone(text)
        self.assertEqual(err, "failed")


class TestSynthesizeDegradation(unittest.TestCase):
    def setUp(self):
        voice_local._piper_voices = {}

    def test_empty_text_rejected_before_loading(self):
        # Must short-circuit without touching the engine.
        with patch.object(voice_local, "_get_piper") as get_piper:
            audio, err = voice_local.synthesize("   ", "ar")
        self.assertIsNone(audio)
        self.assertEqual(err, "empty")
        get_piper.assert_not_called()

    def test_unavailable_when_voice_missing(self):
        with patch.object(voice_local, "_get_piper", return_value=None):
            audio, err = voice_local.synthesize("مرحبا", "ar")
        self.assertIsNone(audio)
        self.assertEqual(err, "unavailable")

    def test_returns_wav_bytes_on_success(self):
        # Piper writes frames into the wave handle it's given; emulate that so
        # the returned buffer is a real, non-empty WAV.
        def fake_synth(text, wav):
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(22050)
            wav.writeframes(b"\x00\x01" * 2205)

        voice = MagicMock()
        voice.synthesize_wav.side_effect = fake_synth
        with patch.object(voice_local, "_get_piper", return_value=voice):
            audio, err = voice_local.synthesize("مرحبا بالعالم", "ar")
        self.assertIsNone(err)
        self.assertTrue(audio.startswith(b"RIFF"))
        self.assertIn(b"WAVE", audio[:12])


class TestUnknownVoiceIsRejected(unittest.TestCase):
    def test_unknown_voice_path_returns_none(self):
        self.assertIsNone(voice_local._ensure_piper_voice_files("no-such-voice"))


class TestStatusNeverRaises(unittest.TestCase):
    def test_status_shape(self):
        status = voice_local.local_voice_status()
        for key in ("stt_available", "tts_available", "whisper_model", "voice_ar", "voice_en"):
            self.assertIn(key, status)
        self.assertIsInstance(status["stt_available"], bool)
        self.assertIsInstance(status["tts_available"], bool)


if __name__ == "__main__":
    unittest.main()
