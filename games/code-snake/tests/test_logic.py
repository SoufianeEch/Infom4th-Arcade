"""Headless tests for the Python game (no window needed): python -m unittest discover games/code-snake/tests"""
import os
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import main as snake  # noqa: E402


class SnakeLogic(unittest.TestCase):
    def setUp(self):
        self.g = snake.Game()
        self.g.new_game()

    def test_new_game_phase_one(self):
        g = self.g
        self.assertEqual((g.state, g.phase, g.lives), ("playing", 1, 3))
        self.assertEqual(len(g.foods), 4)
        self.assertEqual(sum(f["ok"] for f in g.foods), 1)

    def test_questions_well_formed(self):
        for tier in (snake.EASY, snake.MEDIUM, snake.HARD):
            for q in tier:
                self.assertTrue(any("___" in line for line in q["code"]))
                self.assertEqual(len(q["wrong"]), 3)
                self.assertNotIn(q["answer"], q["wrong"])

    def test_right_block_clears_phase(self):
        g = self.g
        food = next(f for f in g.foods if f["ok"])
        r = food["rect"]
        g.snake = [(r.x - 1, r.y), (r.x - 2, r.y), (r.x - 3, r.y), (r.x - 4, r.y)]
        g.dir, g.dirq, g.invuln = snake.RIGHT, [], 0
        g.step()
        self.assertEqual(g.state, "clear")
        self.assertGreater(g.score, 100)

    def test_wrong_block_costs_life(self):
        g = self.g
        food = next(f for f in g.foods if not f["ok"])
        r = food["rect"]
        g.snake = [(r.x - 1, r.y), (r.x - 2, r.y), (r.x - 3, r.y), (r.x - 4, r.y)]
        g.dir, g.dirq, g.invuln = snake.RIGHT, [], 0
        g.step()
        self.assertEqual(g.lives, 2)

    def test_game_over_after_three_lives_and_web_hook_is_noop_on_desktop(self):
        g = self.g
        g.score = 50
        for _ in range(3):
            g.lose_life("x")
        self.assertIn(g.state, ("name", "gameover"))
        snake.report_score(50)      # must not raise outside the browser
        snake.exit_to_arcade()

    def test_pointer_swipe_and_tap(self):
        g = self.g
        g.on_pointer_down((100, 100)); g.on_pointer_up((100, 40))     # swipe up
        self.assertEqual(g.dirq, [snake.UP])
        g.state = "menu"
        g.on_pointer_down((10, 10)); g.on_pointer_up((12, 11))        # tap starts
        self.assertEqual(g.state, "playing")

    def test_geist_fonts_are_bundled_and_load(self):
        for name in ("DotGothic16-Latin.ttf", "DotGothic16-OFL.txt"):
            self.assertTrue((Path(snake.__file__).parent / "fonts" / name).exists(), name)
        self.assertGreater(snake.ui_font(40).get_height(), 10)
        self.assertGreater(snake.mono_font(22).get_height(), 10)
        # flat background: every row has the same colour (no gradient)
        bg = snake.make_background()
        self.assertEqual(bg.get_at((0, 0)), bg.get_at((0, bg.get_height() - 1)))


if __name__ == "__main__":
    unittest.main()
