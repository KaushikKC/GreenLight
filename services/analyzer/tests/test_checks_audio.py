from analyzer.checks import audio_loudness, audio_music, audio_voice_clarity
from analyzer.models import AudioStats
from tests.factories import ctx, probe

NO_AUDIO = {"probe": probe(has_audio=False), "audio": AudioStats()}


class TestLoudness:
    def test_on_target_passes(self):
        assert audio_loudness.check(ctx()).status == "pass"

    def test_quiet_warns_with_gain_fix(self):
        r = audio_loudness.check(ctx(audio=AudioStats(integrated_lufs=-26, true_peak_dbtp=-8)))
        assert r.status == "warn"
        assert "quiet" in r.explanation
        assert r.fix.startswith("Raise the overall volume by about 8 dB")

    def test_loud_warns(self):
        r = audio_loudness.check(ctx(audio=AudioStats(integrated_lufs=-6, true_peak_dbtp=-2)))
        assert r.status == "warn"
        assert "loud" in r.explanation

    def test_clipping_warns_and_keeps_unit_casing(self):
        r = audio_loudness.check(ctx(audio=AudioStats(integrated_lufs=-14, true_peak_dbtp=0.4)))
        assert r.status == "warn"
        assert "dBTP" in r.fix

    def test_no_audio_track_warns(self):
        assert audio_loudness.check(ctx(**NO_AUDIO)).status == "warn"


class TestMusic:
    def test_no_music_passes(self):
        assert audio_music.check(ctx(audio=AudioStats(music_ratio=0.05))).status == "pass"

    def test_music_warns_with_licensing_question(self):
        r = audio_music.check(ctx(audio=AudioStats(music_ratio=0.7)))
        assert r.status == "warn"
        assert r.estimate
        assert "licensed" in r.title

    def test_no_audio_is_na(self):
        assert audio_music.check(ctx(**NO_AUDIO)).status == "na"


class TestVoiceClarity:
    def test_clear_voice_passes(self):
        a = AudioStats(speech_segments=[(0.5, 5)], voice_band_ratio=0.8)
        assert audio_voice_clarity.check(ctx(audio=a)).status == "pass"

    def test_buried_voice_warns_at_first_speech(self):
        a = AudioStats(speech_segments=[(1.2, 5)], voice_band_ratio=0.3)
        r = audio_voice_clarity.check(ctx(audio=a))
        assert r.status == "warn"
        assert r.timestamp_s == 1.2
        assert r.estimate

    def test_no_speech_is_na(self):
        assert audio_voice_clarity.check(ctx(audio=AudioStats())).status == "na"


class TestMusicWithTranscript:
    def test_untranscribed_vad_speech_counts_as_music(self):
        from analyzer.models import Transcript

        # VAD thinks 95% is speech, but Whisper found no words: it's music.
        a = AudioStats(
            speech_ratio=0.95, music_ratio=0.02, speech_segments=[(0, 7)], voice_band_ratio=0.3
        )
        r = audio_music.check(ctx(audio=a, transcript=Transcript()))
        assert r.status == "warn"
        assert audio_voice_clarity.check(ctx(audio=a, transcript=Transcript())).status == "na"

    def test_transcribed_speech_is_not_music(self):
        from tests.factories import transcript

        a = AudioStats(
            speech_ratio=0.5, music_ratio=0.02, speech_segments=[(0, 15)], voice_band_ratio=0.8
        )
        t = transcript((0.0, 16.0, "this is me talking about my routine"))
        assert audio_music.check(ctx(audio=a, transcript=t)).status == "pass"
