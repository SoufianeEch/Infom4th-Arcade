"""Headless tests (no window): python -m unittest discover -s games/type-race/tests"""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as race  # noqa: E402


def type_all(session, text):
    result = None
    for ch in text:
        key = pygame.K_RETURN if ch == "\n" else 0
        result = session.press(key, None if ch == "\n" else ch)
    return result


class RaceLogic(unittest.TestCase):
    def test_snippets_present(self):
        self.assertGreater(len(race.SNIPPETS), 3)

    def test_session_finishes_with_perfect_accuracy(self):
        code = "x = 3\nwhile x > 0:\n    x -= 1"
        s = race.Session(code, "while loops")
        s.started = True
        s.update(5.0)
        self.assertEqual(type_all(s, "x = 3\nwhile x > 0:\nx -= 1"), "done")   # indent auto-filled
        self.assertTrue(s.done)
        self.assertEqual(s.accuracy, 100.0)

    def test_wrong_key_counts_error_not_progress(self):
        s = race.Session("ab", "t")
        self.assertEqual(s.press(0, "z"), "wrong")
        self.assertEqual((s.i, s.errors), (0, 1))
        self.assertLess(s.accuracy, 100)

    def test_paper_fonts_are_bundled_and_monospace_code_font_is_fixed_width(self):
        pygame.init()
        fonts = Path(race.ps.FONT_DIR)
        for name in ("Gaegu-Bold.ttf", "PatrickHand-Regular.ttf", "CourierPrime-Regular.ttf", "CourierPrime-Bold.ttf"):
            self.assertTrue((fonts / name).exists(), name)
        code = race.ps.mono(34)
        adv = race.ps.advance(code)
        self.assertGreater(adv, 8)
        # every printable ASCII glyph advances by the same amount, so the caret can never drift
        widths = {code.metrics(ch)[0][4] for ch in "iWm.,;:()[]{}\"'_-+=<>0123456789abcxyzXYZ"}
        self.assertEqual(widths, {adv})

    def test_caret_and_highlight_cells_line_up_with_glyphs(self):
        app = race.App()
        s = app.session
        s.started = True
        s.i = 3
        app.anim = 0.1
        app.draw()          # must not raise; geometry is derived from one advance + one glyph height
        code = race.ps.mono(34)
        self.assertEqual(race.ps.advance(code), code.metrics("M")[0][4])

    def test_app_finishes_a_run_and_reports(self):
        race.save_best = lambda record: None      # do not write best.json while testing
        app = race.App()
        s = app.session
        s.started = True
        s.update(10.0)
        type_all(s, s.code.replace("\n    ", "\n").replace("\n        ", "\n"))
        app.finish()
        self.assertEqual(app.state, "results")
        self.assertGreater(app.result["score"], 0)


if __name__ == "__main__":
    unittest.main()
