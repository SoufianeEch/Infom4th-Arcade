"""Headless tests (no window): python -m unittest discover -s games/variable-shooter/tests"""
import os
import random
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as vs  # noqa: E402


def engine(seed=1):
    e = vs.Engine(random.Random(seed))
    e.new_game()
    return e


def enemy(word, x=300, y=200.0):
    return {"word": word, "x": x, "y": y, "typed": 0}


def type_word(e, word):
    return [e.type_char(ch) for ch in word]


class ShooterRules(unittest.TestCase):
    def test_typing_a_word_destroys_it_and_scores(self):
        e = engine()
        e.enemies = [enemy("for")]
        self.assertEqual(type_word(e, "for"), ["lock", "hit", "done"])
        self.assertEqual(e.enemies, [])
        self.assertIsNone(e.locked)
        self.assertGreater(e.score, 60)
        self.assertEqual(e.destroyed, 1)

    def test_first_letter_locks_the_lowest_matching_word(self):
        e = engine()
        high, low = enemy("print", 200, 100.0), enemy("pass", 500, 300.0)
        e.enemies = [high, low]
        e.type_char("p")
        self.assertIs(e.locked, low)

    def test_wrong_key_breaks_combo_but_keeps_the_lock(self):
        e = engine()
        e.enemies = [enemy("class")]
        type_word(e, "cl")
        self.assertEqual(e.combo, 2)
        self.assertEqual(e.type_char("x"), "wrong")
        self.assertEqual(e.combo, 0)
        self.assertIsNotNone(e.locked)
        self.assertEqual(e.locked["typed"], 2)
        self.assertEqual(type_word(e, "ass")[-1], "done")

    def test_key_with_no_matching_word_is_wrong(self):
        e = engine()
        e.enemies = [enemy("for")]
        self.assertEqual(e.type_char("z"), "wrong")
        self.assertIsNone(e.locked)

    def test_release_unlocks_and_resets_progress(self):
        e = engine()
        w = enemy("while")
        e.enemies = [w]
        type_word(e, "wh")
        e.release()
        self.assertIsNone(e.locked)
        self.assertEqual(w["typed"], 0)

    def test_special_characters_and_spaces_are_typeable(self):
        e = engine()
        e.enemies = [enemy("x += 1")]
        self.assertEqual(type_word(e, "x += 1")[-1], "done")
        e.enemies = [enemy("{'a': 1}")]
        self.assertEqual(type_word(e, "{'a': 1}")[-1], "done")

    def test_ignores_non_printable_and_input_when_not_playing(self):
        e = engine()
        e.enemies = [enemy("if")]
        self.assertIsNone(e.type_char(""))
        self.assertIsNone(e.type_char("\n"))
        self.assertIsNone(e.type_char("ab"))
        e.pause()
        self.assertIsNone(e.type_char("i"))

    def test_word_reaching_the_line_costs_a_life_and_three_end_the_game(self):
        e = engine()
        for n in range(3):
            e.enemies = [enemy("if", y=vs.DANGER_Y - 1.0)]
            e.update(0.05)
            self.assertEqual(e.lives, 2 - n)
        self.assertEqual(e.state, "gameover")
        self.assertEqual(len([ev for ev in e.events if ev["type"] == "gameover"]), 1)

    def test_landing_releases_a_locked_word(self):
        e = engine()
        w = enemy("print", y=vs.DANGER_Y - 1.0)
        e.enemies = [w]
        e.type_char("p")
        e.update(0.05)
        self.assertIsNone(e.locked)
        self.assertEqual(e.lives, 2)

    def test_wave_advances_every_eight_words_and_gets_harder(self):
        e = engine()
        speed, interval = e.speed, e.spawn_interval
        for _ in range(vs.WORDS_PER_WAVE):
            e.enemies = [enemy("if")]
            type_word(e, "if")
        self.assertEqual(e.wave, 2)
        self.assertGreater(e.speed, speed)
        self.assertLess(e.spawn_interval, interval)
        self.assertTrue(any(ev["type"] == "wave" for ev in e.events))

    def test_word_tiers_unlock_with_waves(self):
        self.assertEqual(len(vs.tiers_for(1)), 1)
        self.assertEqual(len(vs.tiers_for(3)), 2)
        self.assertEqual(len(vs.tiers_for(99)), len(vs.WORDS))

    def test_every_word_is_typeable_ascii_and_does_not_start_with_space(self):
        for tier in vs.WORDS:
            for w in tier:
                self.assertTrue(w.isascii() and w.isprintable() and not w.startswith(" "), w)

    def test_spawned_words_do_not_start_with_the_same_letter_when_avoidable(self):
        e = engine(4)
        e.wave = 6
        e.enemies = []
        for _ in range(4):
            e.spawn()
        firsts = [z["word"][0] for z in e.enemies]
        self.assertEqual(len(firsts), len(set(firsts)))

    def test_accuracy_counts_wrong_keys(self):
        e = engine()
        e.enemies = [enemy("if")]
        e.type_char("z")
        type_word(e, "if")
        self.assertAlmostEqual(e.accuracy, 100 * 2 / 3, places=3)

    def test_perfect_typist_survives_and_scores(self):
        e = engine(7)
        for _ in range(60 * 60):
            if e.enemies and e.state == "playing":
                target = e.locked or max(e.enemies, key=lambda z: z["y"])
                if e.locked is None or e.locked["typed"] < len(e.locked["word"]):
                    e.type_char(target["word"][target["typed"]])
            e.update(1 / 60)
            e.events.clear()
        self.assertEqual(e.state, "playing")
        self.assertEqual(e.lives, 3)
        self.assertGreater(e.destroyed, 15)

    def test_idle_game_always_ends(self):
        for seed in range(4):
            e = engine(seed)
            for _ in range(60 * 90):
                e.update(1 / 60)
                if e.state == "gameover":
                    break
            self.assertEqual(e.state, "gameover", seed)


class ShooterScreens(unittest.TestCase):
    def test_every_screen_draws_and_keys_work(self):
        g = vs.Game()
        g.draw()
        g.start()
        g.eng.enemies = [enemy("lambda", 300, 200.0), enemy("print(x)", 650, 330.0), enemy("if", 480, 440.0)]
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_l, unicode="l"))
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_a, unicode="a"))
        for _ in range(10):
            g.update(1 / 60)
        g.draw()
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_RETURN, unicode="\r"))
        self.assertEqual(g.eng.state, "paused")
        g.draw()
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_RETURN, unicode="\r"))
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_BACKSPACE, unicode="\b"))
        self.assertIsNone(g.eng.locked)
        g.eng.lives = 1
        g.eng.enemies = [enemy("if", y=vs.DANGER_Y - 1.0)]
        g.update(0.05)
        self.assertEqual(g.eng.state, "gameover")
        g.draw()

    def test_letter_p_types_instead_of_pausing(self):
        g = vs.Game()
        g.start()
        g.eng.enemies = [enemy("print", 400, 200.0)]
        g.on_key(pygame.event.Event(pygame.KEYDOWN, key=pygame.K_p, unicode="p"))
        self.assertEqual(g.eng.state, "playing")
        self.assertIsNotNone(g.eng.locked)

    def test_fonts_are_bundled_and_web_hooks_are_safe(self):
        for name in ("Gaegu-Bold.ttf", "PatrickHand-Regular.ttf", "CourierPrime-Bold.ttf"):
            self.assertTrue((Path(vs.ps.FONT_DIR) / name).exists(), name)
        vs.arcade_web.report_score(10)
        vs.arcade_web.exit_to_arcade()


if __name__ == "__main__":
    unittest.main()
