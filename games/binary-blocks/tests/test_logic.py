"""Headless tests (no window): python -m unittest discover -s games/binary-blocks/tests"""
import os
import random
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as bb  # noqa: E402


def engine(seed=1):
    e = bb.Engine(random.Random(seed))
    e.new_game()
    return e


def set_value(e, v):
    e.bits = [(v >> (7 - i)) & 1 for i in range(8)]


class BinaryRules(unittest.TestCase):
    def test_switch_values_are_128_down_to_1(self):
        e = engine()
        for i in range(8):
            e.bits = [0] * 8
            e.toggle(i)
            self.assertEqual(e.value, 1 << (7 - i))
        e.bits = [1] * 8
        self.assertEqual(e.value, 255)
        e.toggle(0)
        self.assertEqual(e.value, 127)

    def test_value_range_grows_with_level(self):
        self.assertEqual([bb.max_value(n) for n in (1, 2, 3, 4, 5, 6, 9)], [7, 15, 31, 63, 127, 255, 255])

    def test_spawned_blocks_stay_in_range_and_lanes_do_not_overlap(self):
        e = engine(3)
        for level in (1, 3, 6):
            e.level = level
            e.blocks.clear()
            for _ in range(40):
                e.blocks.clear()
                b = e.spawn()
                self.assertTrue(1 <= b["value"] <= bb.max_value(level))
                self.assertTrue(0 <= b["lane"] < bb.LANES)
        e.blocks = [{"value": 5, "lane": i, "y": 70.0} for i in range(bb.LANES)]
        self.assertIsNone(e.spawn())                   # no free lane near the top

    def test_lock_clears_the_lowest_matching_block_and_scores(self):
        e = engine()
        e.blocks = [{"value": 9, "lane": 0, "y": 100.0}, {"value": 9, "lane": 1, "y": 250.0}, {"value": 4, "lane": 2, "y": 300.0}]
        set_value(e, 9)
        self.assertEqual(e.lock(), "hit")
        self.assertEqual([(b["value"], b["y"]) for b in e.blocks], [(9, 100.0), (4, 300.0)])   # the lower 9 went
        self.assertGreater(e.score, 0)
        self.assertEqual(e.value, 0)                    # switches reset after a hit
        self.assertEqual(e.combo, 1)

    def test_wrong_lock_breaks_combo_but_costs_no_life(self):
        e = engine()
        e.blocks = [{"value": 9, "lane": 0, "y": 100.0}]
        e.combo = 5
        set_value(e, 10)
        self.assertEqual(e.lock(), "miss")
        self.assertEqual((e.combo, e.lives, len(e.blocks)), (0, 3, 1))

    def test_combo_multiplies_points(self):
        e = engine()
        e.blocks = [{"value": 3, "lane": 0, "y": 200.0}, {"value": 3, "lane": 1, "y": 200.0}]
        set_value(e, 3); e.lock(); first = e.score
        e.combo = 6
        set_value(e, 3); e.lock()
        self.assertGreater(e.score - first, first)

    def test_block_reaching_the_ground_costs_a_life_and_three_end_the_game(self):
        e = engine()
        for n in range(3):
            e.blocks = [{"value": 7, "lane": 0, "y": bb.GROUND_Y - 1.0}]
            e.update(0.05)
            self.assertEqual(e.lives, 2 - n)
        self.assertEqual(e.state, "gameover")
        over = [ev for ev in e.events if ev["type"] == "gameover"]
        self.assertEqual(len(over), 1)

    def test_level_up_every_five_clears_and_blocks_get_faster(self):
        e = engine()
        speed = e.speed
        for _ in range(bb.CLEAR_PER_LEVEL):
            e.blocks = [{"value": 1, "lane": 0, "y": 200.0}]
            set_value(e, 1)
            e.lock()
        self.assertEqual(e.level, 2)
        self.assertGreater(e.speed, speed)
        self.assertTrue(any(ev["type"] == "level" for ev in e.events))

    def test_pause_freezes_everything(self):
        e = engine()
        e.blocks = [{"value": 7, "lane": 0, "y": 100.0}]
        e.pause()
        e.update(1.0)
        self.assertEqual(e.blocks[0]["y"], 100.0)
        e.toggle(0)
        self.assertEqual(e.value, 0)
        e.pause()
        e.update(0.05)
        self.assertGreater(e.blocks[0]["y"], 100.0)

    def test_a_simple_player_survives_and_scores(self):
        """A bot that always locks the lowest block's value should never lose a life at level 1-3 speeds."""
        e = engine(5)
        for _ in range(60 * 90):
            if e.blocks and e.state == "playing":
                set_value(e, max(e.blocks, key=lambda b: b["y"])["value"])
                e.lock()
            e.update(1 / 60)
            e.events.clear()
        self.assertEqual(e.state, "playing")
        self.assertGreater(e.score, 300)
        self.assertEqual(e.lives, 3)

    def test_nobody_playing_always_loses_eventually(self):
        for seed in range(5):
            e = engine(seed)
            for _ in range(60 * 120):
                e.update(1 / 60)
                if e.state == "gameover":
                    break
            self.assertEqual(e.state, "gameover", seed)


class BinaryScreens(unittest.TestCase):
    def test_every_screen_draws(self):
        g = bb.Game()
        g.draw()
        g.start()
        g.eng.blocks = [{"value": 42, "lane": 1, "y": 200.0}, {"value": 7, "lane": 3, "y": 370.0}]
        set_value(g.eng, 42)
        g.on_pointer(bb.LOCK_RECT.center)
        for _ in range(30):
            g.update(1 / 60)
        g.draw()
        g.eng.pause(); g.draw(); g.eng.pause()
        g.eng.lives = 1
        g.eng.blocks = [{"value": 9, "lane": 0, "y": bb.GROUND_Y - 1.0}]
        g.update(0.05)
        self.assertEqual(g.eng.state, "gameover")
        g.draw()

    def test_pointer_toggles_switches_and_locks(self):
        g = bb.Game()
        g.start()
        g.on_pointer(bb.SWITCHES[7].center)
        g.on_pointer(bb.SWITCHES[5].center)
        self.assertEqual(g.eng.value, 1 + 4)
        g.on_pointer(bb.CLEAR_RECT.center)
        self.assertEqual(g.eng.value, 0)

    def test_fonts_are_bundled(self):
        for name in ("Gaegu-Bold.ttf", "PatrickHand-Regular.ttf", "CourierPrime-Bold.ttf"):
            self.assertTrue((Path(bb.ps.FONT_DIR) / name).exists(), name)
        bb.arcade_web.report_score(10)
        bb.arcade_web.exit_to_arcade()


if __name__ == "__main__":
    unittest.main()
