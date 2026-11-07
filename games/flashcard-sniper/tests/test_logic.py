"""Headless tests (no window): python -m unittest discover -s games/flashcard-sniper/tests"""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as sniper  # noqa: E402


class SniperLogic(unittest.TestCase):
    def setUp(self):
        self.g = sniper.Game()
        self.g.reset()
        self.g.next_question()

    def aim_at(self, target):
        pygame.mouse.get_pos = lambda: target.rect.center
        self.g.time_alive = 0

    def test_cards_well_formed(self):
        for c in sniper.CARDS:
            self.assertEqual(len(c["wrong"]), 3)
            self.assertNotIn(c["a"], c["wrong"])

    def test_round_has_four_targets_one_correct(self):
        self.assertEqual(len(self.g.targets), 4)
        self.assertEqual(sum(t.is_correct for t in self.g.targets), 1)

    def test_shooting_correct_scores_and_reveals(self):
        t = next(t for t in self.g.targets if t.is_correct)
        self.aim_at(t)
        self.g.shoot()
        self.assertEqual(self.g.state, "reveal")
        self.assertGreater(self.g.score, 0)
        self.assertEqual(self.g.lives, 3)

    def test_wrong_answer_loses_a_life(self):
        t = next(t for t in self.g.targets if not t.is_correct)
        self.aim_at(t)
        self.g.shoot()
        self.assertEqual(self.g.lives, 2)

    def test_game_over_updates_best_and_runs_web_hooks_safely(self):
        g = self.g
        g.score, g.lives = 77, 0
        g.state, g.reveal_left = "reveal", 0.01
        g.update(0.05)
        self.assertEqual(g.state, "gameover")
        self.assertEqual(g.high_score, 77)
        sniper.arcade_web.exit_to_arcade()    # no-op outside the browser

    def test_geist_fonts_are_bundled_and_load(self):
        for name in ("DotGothic16-Latin.ttf", "DotGothic16-OFL.txt"):
            self.assertTrue((Path(sniper.__file__).parent / "fonts" / name).exists(), name)
        self.assertGreater(sniper.ui_font(40).get_height(), 10)
        self.assertGreater(sniper.mono_font(22).get_height(), 10)
        # flat background: every row has the same colour (no gradient)
        bg = sniper.make_background()
        self.assertEqual(bg.get_at((0, 0)), bg.get_at((0, bg.get_height() - 1)))


if __name__ == "__main__":
    unittest.main()
