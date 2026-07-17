"""Key-free local voice: Whisper for speech-to-text, Piper for text-to-speech.

The OpenAI Realtime path (voice_realtime.py) needs a paid key and ships audio to
a third party. This module is the local alternative, matching the same "runs on
your own hardware" stance as the Ollama LLM/embedding fallbacks:

  - STT: faster-whisper (CTranslate2). Decodes browser webm/opus through PyAV,
    which bundles the FFmpeg libraries — so no system ffmpeg is needed.
  - TTS: Piper (ONNX). Ships espeak-ng-data inside the wheel, so no system
    espeak-ng either. Arabic voice: ar_JO-kareem.

Neither engine is imported at module load: both are optional and heavy, so the
sidecar must boot (and every non-voice feature keep working) when they are
absent. Models download on first use into VOICE_MODELS_DIR, which is a Docker
volume — keeping them out of the image and letting you swap models without a
rebuild.
"""
import os
import threading
from typing import Optional, Tuple

# Whisper size/accuracy trade-off. "base" is the fast default; "small" noticeably
# improves Arabic if the box can afford it.
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

VOICE_MODELS_DIR = os.getenv("VOICE_MODELS_DIR", "/models")

# Piper voice per UI language. Arabic ships as ar_JO-kareem (Jordanian) — the
# only Arabic voice Piper publishes.
PIPER_VOICE_AR = os.getenv("PIPER_VOICE_AR", "ar_JO-kareem-medium")
PIPER_VOICE_EN = os.getenv("PIPER_VOICE_EN", "en_US-lessac-medium")

_PIPER_BASE_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/main"
# Piper publishes voices under <lang>/<locale>/<speaker>/<quality>/<name>.onnx;
# the name itself carries every part needed to rebuild that path.
_PIPER_VOICE_PATHS = {
    "ar_JO-kareem-medium": "ar/ar_JO/kareem/medium",
    "ar_JO-kareem-low": "ar/ar_JO/kareem/low",
    "en_US-lessac-medium": "en/en_US/lessac/medium",
    "en_US-lessac-low": "en/en_US/lessac/low",
}

# Loading a model takes seconds and is not thread-safe to do twice; cache per
# process behind a lock so concurrent requests share one instance.
_whisper_model = None
_whisper_lock = threading.Lock()
_piper_voices = {}
_piper_lock = threading.Lock()


def voice_for_lang(lang: str) -> str:
    """Piper voice name for a UI language."""
    return PIPER_VOICE_AR if lang == "ar" else PIPER_VOICE_EN


def _get_whisper():
    """Load (once) the local Whisper model, or None when unavailable."""
    global _whisper_model
    if _whisper_model is not None:
        return _whisper_model
    with _whisper_lock:
        if _whisper_model is not None:
            return _whisper_model
        try:
            from faster_whisper import WhisperModel

            _whisper_model = WhisperModel(
                WHISPER_MODEL,
                device="cpu",
                compute_type=WHISPER_COMPUTE_TYPE,
                download_root=os.path.join(VOICE_MODELS_DIR, "whisper"),
            )
            print(f"[voice_local] whisper '{WHISPER_MODEL}' ready ({WHISPER_COMPUTE_TYPE})")
        except Exception as e:
            print(f"[voice_local] whisper unavailable: {e}")
            _whisper_model = None
    return _whisper_model


def _ensure_piper_voice_files(voice: str) -> Optional[str]:
    """Return the local .onnx path for a voice, downloading it on first use.

    Returns None when the voice is unknown or the download fails — callers then
    surface a clean localized error instead of a stack trace.
    """
    rel = _PIPER_VOICE_PATHS.get(voice)
    if not rel:
        print(f"[voice_local] unknown piper voice '{voice}'")
        return None

    target_dir = os.path.join(VOICE_MODELS_DIR, "piper")
    onnx_path = os.path.join(target_dir, voice + ".onnx")
    json_path = onnx_path + ".json"
    if os.path.exists(onnx_path) and os.path.exists(json_path):
        return onnx_path

    try:
        import urllib.request

        os.makedirs(target_dir, exist_ok=True)
        for suffix, dest in ((".onnx", onnx_path), (".onnx.json", json_path)):
            if os.path.exists(dest):
                continue
            url = f"{_PIPER_BASE_URL}/{rel}/{voice}{suffix}"
            print(f"[voice_local] downloading {voice}{suffix} …")
            # Download to a temp name first so an interrupted download can never
            # leave a truncated model that looks cached on the next call.
            tmp = dest + ".part"
            urllib.request.urlretrieve(url, tmp)
            os.replace(tmp, dest)
        return onnx_path
    except Exception as e:
        print(f"[voice_local] piper voice download failed for '{voice}': {e}")
        return None


def _get_piper(voice: str):
    """Load (once per voice) a Piper voice, or None when unavailable."""
    cached = _piper_voices.get(voice)
    if cached is not None:
        return cached
    with _piper_lock:
        cached = _piper_voices.get(voice)
        if cached is not None:
            return cached
        onnx_path = _ensure_piper_voice_files(voice)
        if not onnx_path:
            return None
        try:
            from piper import PiperVoice

            loaded = PiperVoice.load(onnx_path, config_path=onnx_path + ".json")
            _piper_voices[voice] = loaded
            print(f"[voice_local] piper voice '{voice}' ready")
            return loaded
        except Exception as e:
            print(f"[voice_local] piper unavailable: {e}")
            return None


def transcribe(audio_bytes: bytes, lang: Optional[str] = None) -> Tuple[Optional[str], Optional[str]]:
    """Speech to text. Returns (text, error_code).

    error_code is None on success, otherwise one of "unavailable" / "failed" so
    the caller can pick a localized message.
    """
    model = _get_whisper()
    if model is None:
        return None, "unavailable"

    import tempfile

    tmp_path = None
    try:
        # faster-whisper reads from a path/file object; PyAV decodes whatever
        # container the browser sent (webm/opus, mp4/aac, wav…).
        with tempfile.NamedTemporaryFile(suffix=".audio", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name
        segments, _info = model.transcribe(tmp_path, language=lang or None)
        text = " ".join(s.text.strip() for s in segments).strip()
        return text, None
    except Exception as e:
        print(f"[voice_local] transcription failed: {e}")
        return None, "failed"
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def synthesize(text: str, lang: str = "ar") -> Tuple[Optional[bytes], Optional[str]]:
    """Text to speech. Returns (wav_bytes, error_code)."""
    if not text or not text.strip():
        return None, "empty"

    voice = _get_piper(voice_for_lang(lang))
    if voice is None:
        return None, "unavailable"

    import io
    import wave

    try:
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wav:
            voice.synthesize_wav(text, wav)
        return buf.getvalue(), None
    except Exception as e:
        print(f"[voice_local] synthesis failed: {e}")
        return None, "failed"


def local_voice_status() -> dict:
    """Which engines are actually usable right now — lets the UI (and an
    operator) see the truth without triggering a model download."""
    try:
        import faster_whisper  # noqa: F401

        stt = True
    except Exception:
        stt = False
    try:
        import piper  # noqa: F401

        tts = True
    except Exception:
        tts = False
    return {
        "stt_available": stt,
        "tts_available": tts,
        "whisper_model": WHISPER_MODEL,
        "voice_ar": PIPER_VOICE_AR,
        "voice_en": PIPER_VOICE_EN,
    }
