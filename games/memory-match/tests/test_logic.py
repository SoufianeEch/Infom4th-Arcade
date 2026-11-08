"""Headless tests (no window): python -m unittest discover -s games/memory-match/tests"""
import os
import random
import sys
import unittest
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as mm  # noqa: E402


def engine(seed=1):
    e = mm.Engine(random.Random(seed))
    e.new_game()
    return e


def advance(e, seconds):
    for _ in range(int(seconds * 60) + 2):         # update() clamps each step to 0.05s, like a real frame
        e.update(1 / 60)


def find_pair(e):
    """Indexes (code_card, meaning_card) of some unmatched pair."""
    for i, a in enumerate(e.cards):
        if a["state"] == "down" and a["kind"] == "code":
            for j, b in enumerate(e.cards):
                if b["pair"] == a["pair"] and b["kind"] == "meaning":
                    return i, j


def find_mismatch(e):
    ups = [i for i, c in enumerate(e.cards) if c["state"] == "down"]
    for i in ups:
        for j in ups:
            if i != j and e.cards[i]["pair"] != e.cards[j]["pair"]:
                return i, j


class MemoryRules(unittest.TestCase):
    def test_data_is_well_formed(self):
        codes = [c for c, _ in mm.PAIRS]
        meanings = [m for _, m in mm.PAIRS]
        self.assertEqual(len(codes), len(set(codes)), "duplicate code cards")
        self.assertEqual(len(meanings), len(set(meanings)), "duplicate meaning cards would make pairs ambiguous")
        self.assertGreaterEqual(len(mm.PAIRS), 12)
        for code, meaning in mm.PAIRS:
            self.assertTrue(code and meaning and len(meaning) <= 24, (code, meaning))

    def test_levels_get_bigger_then_cap_and_time_is_always_enough_to_play(self):
        self.assertEqual([mm.pairs_for(n) for n in (1, 2, 3, 4, 5, 9)], [6, 8, 10, 12, 12, 12])
        for level in range(1, 15):
            self.assertGreaterEqual(mm.time_for(level), mm.pairs_for(level) * 7)
            cols, rows = mm.grid_for(mm.pairs_for(level))
            self.assertEqual(cols * rows, 2 * mm.pairs_for(level))

    def test_new_game_deals_shuffled_pairs_face_down(self):
        e = engine()
        self.assertEqual(len(e.cards), 12)
        self.assertTrue(all(c["state"] == "down" for c in e.cards))
        by_pair = {}
        for c in e.cards:
            by_pair.setdefault(c["pair"], []).append(c["kind"])
        self.assertTrue(all(sorted(k) == ["code", "meaning"] for k in by_pair.values()))
        self.assertEqual(e.state, "playing")

    def test_matching_pair_stays_up_and_scores_with_streak(self):
        e = engine()
        i, j = find_pair(e)
        self.assertEqual(e.flip(i), "up")
        self.assertEqual(e.flip(j), "match")
        self.assertEqual({e.cards[i]["state"], e.cards[j]["state"]}, {"matched"})
        self.assertEqual((e.score, e.streak, e.moves), (50, 1, 1))
        i, j = find_pair(e)
        e.flip(i); e.flip(j)
        self.assertEqual(e.score, 50 + 60)

    def test_mismatch_hides_after_a_moment_and_resets_streak(self):
        e = engine()
        e.streak = 3
        i, j = find_mismatch(e)
        e.flip(i)
        self.assertEqual(e.flip(j), "mismatch")
        self.assertEqual(e.streak, 0)
        self.assertEqual(e.cards[i]["state"], "up")
        advance(e, mm.MISMATCH_TIME + 0.05)
        self.assertEqual((e.cards[i]["state"], e.cards[j]["state"]), ("down", "down"))

    def test_tapping_during_a_mismatch_resolves_it_and_flips_the_new_card(self):
        e = engine()
        i, j = find_mismatch(e)
        e.flip(i); e.flip(j)
        k = next(n for n, c in enumerate(e.cards) if c["state"] == "down")
        self.assertEqual(e.flip(k), "up")
        self.assertEqual((e.cards[i]["state"], e.cards[j]["state"]), ("down", "down"))
        self.assertEqual(e.cards[k]["state"], "up")

    def test_cannot_flip_the_same_or_a_matched_card_twice(self):
        e = engine()
        e.flip(0)
        self.assertEqual(e.flip(0), "ignored")
        e = engine()
        i, j = find_pair(e)
        e.flip(i); e.flip(j)
        self.assertEqual(e.flip(i), "ignored")
        self.assertEqual(e.flip(99), "ignored")
        self.assertEqual(e.flip(-1), "ignored")

    def test_clearing_the_board_gives_a_bonus_then_starts_the_next_level(self):
        e = engine()
        while True:
            pair = find_pair(e)
            if pair is None:
                break
            e.flip(pair[0]); e.flip(pair[1])
        self.assertEqual(e.state, "clear")
        clear = [ev for ev in e.events if ev["type"] == "level_clear"]
        self.assertEqual(len(clear), 1)
        self.assertGreater(clear[0]["bonus"], 0)
        advance(e, 2.0)
        self.assertEqual((e.state, e.level, len(e.cards)), ("playing", 2, 16))
        self.assertTrue(all(c["state"] == "down" for c in e.cards))

    def test_running_out_of_time_ends_the_game_once(self):
        e = engine()
        e.score = 120
        for _ in range(60 * 200):
            e.update(1 / 60)
            if e.state == "gameover":
                break
        self.assertEqual(e.state, "gameover")
        over = [ev for ev in e.events if ev["type"] == "gameover"]
        self.assertEqual(len(over), 1)
        self.assertEqual(over[0]["score"], 120)
        e.update(1.0)
        self.assertEqual(len([ev for ev in e.events if ev["type"] == "gameover"]), 1)

    def test_a_perfect_player_clears_several_levels(self):
        e = engine(9)
        for _ in range(60 * 600):
            if e.state == "playing":
                pair = find_pair(e)
                if pair:
                    e.flip(pair[0]); e.flip(pair[1])
            e.update(1 / 60)
            e.events.clear()
            if e.level >= 5:
                break
        self.assertGreaterEqual(e.level, 5)
        self.assertGreater(e.score, 1000)


class MemoryScreens(unittest.TestCase):
    def test_every_screen_draws_and_pointer_flips_cards(self):
        g = mm.Game()
        g.draw()
        g.start()
        self.assertEqual(len(g.rects), 12)
        g.on_pointer(g.rects[3].center)
        self.assertEqual(g.eng.cards[3]["state"], "up")
        pair = find_pair(g.eng)
        g.on_pointer(g.rects[pair[0]].center)
        g.on_pointer(g.rects[pair[1]].center)
        g.hover = 2
        for _ in range(5):
            g.update(1 / 60)
        g.draw()
        g.eng.time_left = 0.01
        g.update(0.05)
        self.assertEqual(g.eng.state, "gameover")
        g.draw()

    def test_card_text_fits_on_the_smallest_cards(self):
        mm.pygame.init()
        for level in (1, 2, 3, 4):
            rects = mm.layout(mm.pairs_for(level) * 2)
            smallest = min(rects, key=lambda r: r.w * r.h)
            for code, meaning in mm.PAIRS:
                fonts = [mm.ps.body(s) for s in (19,)]
                lines = mm.wrap(meaning, fonts[0], smallest.w - 20)
                self.assertLessEqual(len(lines) * fonts[0].get_height(), smallest.h - 16, (level, meaning))
                self.assertLessEqual(min(mm.ps.mono(16, bold=True).size(line)[0] for line in [code]), smallest.w - 20, (level, code))

    def test_keyboard_moves_the_cursor_and_flips(self):
        g = mm.Game()
        g.start()
        key = lambda k: g.on_key(pygame.event.Event(pygame.KEYDOWN, key=k, unicode=""))
        key(pygame.K_RIGHT); key(pygame.K_DOWN)
        self.assertEqual(g.cursor, 1 + 4)
        key(pygame.K_SPACE)
        self.assertEqual(g.eng.cards[5]["state"], "up")

    def test_fonts_are_bundled_and_web_hooks_are_safe(self):
        for name in ("Gaegu-Bold.ttf", "PatrickHand-Regular.ttf", "CourierPrime-Bold.ttf"):
            self.assertTrue((Path(mm.ps.FONT_DIR) / name).exists(), name)
        mm.arcade_web.report_score(10)
        mm.arcade_web.exit_to_arcade()


if __name__ == "__main__":
    unittest.main()
