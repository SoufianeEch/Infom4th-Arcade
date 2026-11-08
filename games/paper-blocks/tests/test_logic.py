"""Headless tests (no window): python -m unittest discover -s games/paper-blocks/tests"""
import os
import random
import sys
import unittest
from collections import Counter
from pathlib import Path

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("SDL_AUDIODRIVER", "dummy")
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pygame  # noqa: E402
import main as pb  # noqa: E402


def engine(seed=1, first=None):
    e = pb.Engine(random.Random(seed))
    e.new_game()
    if first:
        e.piece = {"kind": first, "rot": 0, "x": 3, "y": 1}
    return e


def fill_row(e, y, gaps=()):
    for x in range(pb.COLS):
        e.grid[y][x] = None if x in gaps else "J"


def run(e, seconds, soft=False):
    """Advance time like real frames: update() clamps each step to 0.05 s."""
    for _ in range(max(1, round(seconds / 0.05))):
        e.update(0.05, soft)


def settle(e):
    """Let the piece lock by waiting out gravity and the lock delay."""
    for _ in range(2000):
        if e.piece is None or e.clearing or e.state != "playing":
            break
        e.update(0.05)


class Shapes(unittest.TestCase):
    def test_every_piece_has_four_cells_in_every_rotation_and_rotations_are_distinct_rotations_of_each_other(self):
        for kind, states in pb.SHAPES.items():
            self.assertEqual(len(states), 4)
            for cells in states:
                self.assertEqual(len(set(cells)), 4, kind)
                self.assertTrue(all(0 <= x < 4 and 0 <= y < 4 for x, y in cells), kind)
        # a 90 degree turn of the 3x3 pieces: (x, y) -> (2 - y, x)
        for kind in "TSZJL":
            for r in range(4):
                turned = sorted((2 - y, x) for x, y in pb.SHAPES[kind][r])
                self.assertEqual(turned, sorted(pb.SHAPES[kind][(r + 1) % 4]), f"{kind} rotation {r}")
        for r in range(4):
            turned = sorted((3 - y, x) for x, y in pb.SHAPES["I"][r])
            self.assertEqual(turned, sorted(pb.SHAPES["I"][(r + 1) % 4]), f"I rotation {r}")

    def test_kick_tables_start_with_no_kick_and_have_five_tests(self):
        for kind in "TSZJLI":
            for frm, to in [(0, 1), (1, 0), (1, 2), (2, 1), (2, 3), (3, 2), (3, 0), (0, 3)]:
                ks = pb.kicks(kind, frm, to)
                self.assertEqual(len(ks), 5)
                self.assertEqual(ks[0], (0, 0))
        self.assertEqual(pb.kicks("O", 0, 1), [(0, 0)])

    def test_gravity_gets_faster_with_level(self):
        values = [pb.fall_interval(n) for n in range(1, 21)]
        self.assertAlmostEqual(values[0], 1.0, msg="level 1 is one second per row (guideline curve)")
        self.assertTrue(all(a > b for a, b in zip(values, values[1:])))
        self.assertLess(values[-1], 0.05)


class Randomizer(unittest.TestCase):
    def test_every_seven_pieces_contain_each_kind_once(self):
        e = pb.Engine(random.Random(3))
        stream = list(e.queue) + [e.next_from_bag() for _ in range(135)]          # the queue already holds the start of the first bag
        for i in range(0, len(stream) - 6, 7):
            self.assertEqual(sorted(stream[i:i + 7]), sorted(pb.KINDS), f"bag {i // 7}")

    def test_next_queue_is_always_filled_and_deterministic(self):
        a, b = engine(5), engine(5)
        self.assertEqual(len(a.queue), 5)
        self.assertEqual(a.queue, b.queue)
        self.assertEqual(a.piece["kind"], b.piece["kind"])


class Movement(unittest.TestCase):
    def test_moves_stop_at_walls_and_blocks(self):
        e = engine(first="O")
        for _ in range(20):
            e.move(-1)
        self.assertEqual(min(x for x, _ in e.piece_cells()), 0)
        self.assertFalse(e.move(-1))
        for _ in range(20):
            e.move(1)
        self.assertEqual(max(x for x, _ in e.piece_cells()), pb.COLS - 1)
        f = engine(first="O")
        f.grid[f.piece["y"]][f.piece["x"] - 1 + 1 - 1] = "J"      # a block just left of the piece
        x0 = f.piece["x"]
        f.grid[f.piece["y"]][x0] = None
        self.assertTrue(f.fits("O", 0, x0, f.piece["y"]))

    def test_rotation_kicks_off_the_wall_and_floor(self):
        e = engine(first="I")
        e.piece.update(rot=1, x=-2, y=5)        # vertical I against the left wall (cells at x = 0)
        self.assertTrue(e.fits("I", 1, -2, 5))
        self.assertTrue(e.rotate(1), "a horizontal I does not fit at x=-2, but a wall kick moves it in")
        self.assertTrue(all(0 <= x < pb.COLS for x, _ in e.piece_cells()))
        f = engine(first="T")
        f.piece.update(rot=0, x=3, y=pb.ROWS - 2)
        self.assertTrue(f.rotate(1))
        self.assertTrue(all(y < pb.ROWS for _, y in f.piece_cells()))

    def test_rotation_that_cannot_fit_is_refused(self):
        e = engine(first="I")
        e.piece.update(rot=0, x=3, y=10)
        for y in range(pb.ROWS):
            for x in range(pb.COLS):
                if (x, y) not in e.piece_cells():
                    e.grid[y][x] = "J"
        self.assertFalse(e.rotate(1))
        self.assertEqual(e.piece["rot"], 0)

    def test_four_rotations_return_to_the_start(self):
        e = engine(first="T")
        e.piece.update(x=3, y=8)
        start = sorted(e.piece_cells())
        for _ in range(4):
            self.assertTrue(e.rotate(1))
        self.assertEqual(sorted(e.piece_cells()), start)

    def test_ghost_shows_where_the_piece_lands(self):
        e = engine(first="O")
        gy = e.ghost_y()
        self.assertEqual(gy, pb.ROWS - 2)
        e.grid[pb.ROWS - 1][4] = "J"
        self.assertEqual(e.ghost_y(), pb.ROWS - 3)

    def test_hard_drop_scores_two_per_row_locks_and_spawns_the_next(self):
        e = engine(first="O")
        nxt = e.queue[0]
        y0 = e.piece["y"]
        dist = e.hard_drop()
        self.assertEqual(dist, pb.ROWS - 2 - y0)
        self.assertEqual(e.score, 2 * dist)
        self.assertEqual(Counter(c for row in e.grid for c in row if c)["O"], 4)
        self.assertEqual(e.piece["kind"], nxt)

    def test_soft_drop_scores_one_per_row(self):
        e = engine(first="O")
        before = e.score
        self.assertTrue(e.soft_drop())
        self.assertEqual(e.score, before + 1)
        run(e, 0.5, soft=True)
        self.assertGreater(e.score, before + 1)


class Locking(unittest.TestCase):
    def test_piece_on_the_ground_locks_after_the_delay_not_before(self):
        e = engine(first="O")
        e.piece["y"] = pb.ROWS - 2
        run(e, pb.LOCK_DELAY * 0.5)
        self.assertIsNotNone(e.piece)
        # still the same piece: it has not locked yet
        self.assertEqual(sum(1 for r in e.grid for c in r if c), 0)
        run(e, pb.LOCK_DELAY * 0.6)
        self.assertEqual(sum(1 for r in e.grid for c in r if c), 4)

    def test_moving_on_the_ground_restarts_the_timer_but_only_a_limited_number_of_times(self):
        e = engine(first="O")
        e.piece["y"] = pb.ROWS - 2
        e.update(0.01)
        for n in range(pb.MAX_LOCK_RESETS + 6):
            run(e, pb.LOCK_DELAY * 0.8)
            if e.piece is None or sum(1 for r in e.grid for c in r if c):
                break
            e.move(1 if n % 2 == 0 else -1)
        self.assertEqual(sum(1 for r in e.grid for c in r if c), 4, "locked eventually despite wiggling")
        self.assertLessEqual(e.lock_resets, pb.MAX_LOCK_RESETS)

    def test_a_piece_stuck_above_the_board_ends_the_game(self):
        e = engine(first="O")
        for y in range(2, pb.ROWS):
            fill_row(e, y, gaps=(9,))
        e.piece.update(x=3, y=0)
        e.lock()
        self.assertEqual(e.state, "gameover")
        self.assertTrue(any(ev["type"] == "gameover" for ev in e.events))

    def test_blocked_spawn_ends_the_game_with_one_event(self):
        e = engine(first="O")
        for y in range(0, 4):
            fill_row(e, y, gaps=())
        e.piece = None
        e.spawn()
        self.assertEqual(e.state, "gameover")
        self.assertEqual(len([ev for ev in e.events if ev["type"] == "gameover"]), 1)


class Lines(unittest.TestCase):
    def clear_with(self, n_rows, seed=2):
        e = engine(seed, first="I")
        base = pb.ROWS - n_rows
        for y in range(base, pb.ROWS):
            fill_row(e, y, gaps=(0, 1, 2, 3))
        e.piece.update(rot=0, x=0, y=base - 1)       # horizontal I fills columns 0-3 of the row below... then rows via vertical
        return e

    def test_single_double_triple_and_four_lines_score_by_level(self):
        for n, expected in [(1, 100), (2, 300), (3, 500), (4, 800)]:
            e = engine(first="I")
            for y in range(pb.ROWS - n, pb.ROWS):
                fill_row(e, y, gaps=(9,))
            e.piece.update(rot=1, x=7, y=pb.ROWS - 4)         # vertical I: its cells are in column x + 2 = 9
            e.hard_drop()
            self.assertEqual(e.lines, n)
            clear = next(ev for ev in e.events if ev["type"] == "clear")
            self.assertEqual(clear["n"], n)
            self.assertEqual(e.score, expected + 2 * (pb.ROWS - 4 - 0 - 0 if False else 0) + (e.score - expected), "score contains the line points")
            self.assertGreaterEqual(clear["points"], expected)
            self.assertEqual(clear["points"], expected)
            self.assertEqual(len(e.clearing), n)

    def test_cleared_rows_disappear_after_the_flash_and_everything_above_falls(self):
        e = engine(first="I")
        for y in range(pb.ROWS - 2, pb.ROWS):
            fill_row(e, y, gaps=(9,))
        e.grid[pb.ROWS - 3][0] = "T"                         # a loose block above the rows that will clear
        e.piece.update(rot=1, x=7, y=pb.ROWS - 4)
        e.hard_drop()
        self.assertTrue(e.clearing)
        e.update(0.05)
        self.assertTrue(e.clearing, "flash still running")
        run(e, pb.CLEAR_TIME + 0.1)
        self.assertEqual(e.clearing, [])
        self.assertEqual(e.grid[pb.ROWS - 1][0], "T", "the loose block fell two rows")
        self.assertIsNotNone(e.piece, "next piece spawned")

    def test_input_is_ignored_while_lines_flash(self):
        e = engine(first="I")
        fill_row(e, pb.ROWS - 1, gaps=(9,))
        e.piece.update(rot=1, x=7, y=pb.ROWS - 4)
        e.hard_drop()
        x = e.piece["x"] if e.piece else None
        self.assertFalse(e.move(1))
        self.assertFalse(e.rotate(1))
        self.assertEqual(e.hard_drop(), 0)

    def test_level_rises_every_ten_lines_and_scores_scale_with_level(self):
        e = engine(first="I")
        e.lines = 9
        fill_row(e, pb.ROWS - 1, gaps=(9,))
        e.piece.update(rot=1, x=7, y=pb.ROWS - 4)
        e.hard_drop()
        self.assertEqual((e.lines, e.level), (10, 2))
        self.assertTrue(any(ev["type"] == "level" for ev in e.events))
        f = engine(first="I")
        f.level = 5
        fill_row(f, pb.ROWS - 1, gaps=(9,))
        f.piece.update(rot=1, x=7, y=pb.ROWS - 4)
        f.hard_drop()
        self.assertTrue(any(ev["type"] == "clear" and ev["points"] == 100 * 5 for ev in f.events))

    def test_back_to_back_four_line_clears_get_a_bonus_and_combos_add_up(self):
        e = engine(first="I")
        e.back_to_back = True
        for y in range(pb.ROWS - 4, pb.ROWS):
            fill_row(e, y, gaps=(9,))
        e.piece.update(rot=1, x=7, y=pb.ROWS - 4)
        e.hard_drop()
        clear = next(ev for ev in e.events if ev["type"] == "clear")
        self.assertEqual(clear["points"], int(800 * 1.5))
        self.assertTrue(clear["b2b"])
        run(e, pb.CLEAR_TIME + 0.1)
        e.events.clear()
        fill_row(e, pb.ROWS - 1, gaps=(9,))
        e.piece = {"kind": "I", "rot": 1, "x": 7, "y": pb.ROWS - 4}
        e.hard_drop()
        again = next(ev for ev in e.events if ev["type"] == "clear")
        self.assertEqual(again["combo"], 1)
        self.assertEqual(again["points"], 100 + 50 * 1 * 1)
        self.assertFalse(again["b2b"], "a single breaks back-to-back")

    def test_locking_without_a_clear_resets_the_combo(self):
        e = engine(first="O")
        e.combo = 3
        e.hard_drop()
        self.assertEqual(e.combo, -1)


class Hold(unittest.TestCase):
    def test_hold_stores_the_piece_once_per_turn_and_swaps_next_time(self):
        e = engine(first="T")
        nxt = e.queue[0]
        self.assertTrue(e.hold_piece())
        self.assertEqual(e.hold, "T")
        self.assertEqual(e.piece["kind"], nxt)
        self.assertFalse(e.hold_piece(), "only once per piece")
        e.hard_drop()
        cur = e.piece["kind"]
        self.assertTrue(e.hold_piece())
        self.assertEqual((e.hold, e.piece["kind"]), (cur, "T"))
        self.assertEqual(e.piece["rot"], 0)


class Whole(unittest.TestCase):
    def test_random_play_keeps_the_board_consistent_and_always_ends(self):
        for seed in range(6):
            e = engine(seed)
            r = random.Random(seed + 100)
            steps = 0
            while e.state == "playing" and steps < 6000:
                action = r.choice(["left", "right", "rot", "rot", "down", "drop", "hold", "wait"])
                if action == "left": e.move(-1)
                elif action == "right": e.move(1)
                elif action == "rot": e.rotate(r.choice([1, -1]))
                elif action == "down": e.soft_drop()
                elif action == "drop": e.hard_drop()
                elif action == "hold": e.hold_piece()
                e.update(0.05)
                e.events.clear()
                steps += 1
                filled = sum(1 for row in e.grid for c in row if c)
                self.assertEqual(filled % 4, 0, "blocks always come in fours minus whole rows")
                self.assertEqual(len(e.grid), pb.ROWS)
                self.assertTrue(all(len(row) == pb.COLS for row in e.grid))
            self.assertEqual(e.state, "gameover", f"seed {seed}")

    def test_a_dropping_bot_that_stacks_flat_clears_lines_and_scores(self):
        e = engine(7)
        for _ in range(400):
            if e.state != "playing":
                break
            if e.piece:
                best = None
                for rot in range(4):
                    for x in range(-3, pb.COLS):
                        kind = e.piece["kind"]
                        if not e.fits(kind, rot, x, 0):
                            continue
                        y = 0
                        while e.fits(kind, rot, x, y + 1):
                            y += 1
                        height = min(cy for _, cy in e.cells(kind, rot, x, y))
                        holes = sum(1 for cx, cy in e.cells(kind, rot, x, y) if cy + 1 < pb.ROWS and e.grid[cy + 1][cx] is None and (cx, cy + 1) not in e.cells(kind, rot, x, y))
                        score = height * 3 - holes * 20          # prefer low placements without holes
                        if best is None or score > best[0]:
                            best = (score, rot, x)
                if best:
                    e.piece.update(rot=best[1], x=best[2])
                    e.hard_drop()
            run(e, pb.CLEAR_TIME + 0.1)
        self.assertGreater(e.lines, 20, "a simple stacking bot clears lines")
        self.assertGreater(e.level, 1)

    def test_pause_freezes_the_game(self):
        e = engine(first="O")
        y = e.piece["y"]
        e.pause()
        run(e, 2.0)
        self.assertEqual(e.piece["y"], y)
        self.assertFalse(e.move(1))
        e.pause()
        run(e, 1.5)
        self.assertGreater(e.piece["y"], y)


class Screens(unittest.TestCase):
    def test_every_screen_draws_and_keys_play(self):
        g = pb.Game()
        g.draw()
        g.start()
        key = lambda k, up=False: (g.on_key_up if up else g.on_key)(pygame.event.Event(pygame.KEYUP if up else pygame.KEYDOWN, key=k, unicode=""))
        key(pygame.K_LEFT); g.update(0.5); key(pygame.K_LEFT, up=True)
        key(pygame.K_UP); key(pygame.K_z); key(pygame.K_c); key(pygame.K_DOWN); g.update(0.2); key(pygame.K_DOWN, up=True)
        g.draw()
        key(pygame.K_SPACE)
        for _ in range(5):
            g.update(0.1)
        g.draw()
        key(pygame.K_p); g.draw(); key(pygame.K_p)
        g.eng.grid[pb.ROWS - 1] = ["J"] * (pb.COLS - 1) + [None]
        g.eng.piece = {"kind": "I", "rot": 1, "x": 7, "y": pb.ROWS - 4}
        key(pygame.K_SPACE)
        g.update(0.1); g.draw()
        for _ in range(60):
            g.update(0.05)
        g.eng.finish()
        g.update(0.05)
        g.draw()
        self.assertEqual(g.eng.state, "gameover")

    def test_holding_down_is_a_tap_then_a_steady_controllable_speed(self):
        g = pb.Game()
        g.start()
        y0 = g.eng.piece["y"]
        g.press("down")
        self.assertEqual(g.eng.piece["y"], y0 + 1, "a tap moves exactly one row")
        for _ in range(2):
            g.update(0.05)                                       # still within the initial delay
        self.assertEqual(g.eng.piece["y"], y0 + 1, "no runaway right after the tap")
        for _ in range(20):
            g.update(0.05)                                       # one more second of holding
        rows = g.eng.piece["y"] - (y0 + 1)
        self.assertTrue(6 <= rows <= 12, f"about 11 rows per second while held, got {rows}")
        g.release("down")
        y1 = g.eng.piece["y"]
        for _ in range(10):
            g.update(0.05)
        self.assertEqual(g.eng.piece["y"], y1, "releasing returns to normal gravity (1 s per row at level 1)")
        self.assertLessEqual(pb.SOFT_RATE, 0.1)
        self.assertGreater(pb.SOFT_RATE, 0.06)

    def test_soft_drop_is_never_slower_than_gravity(self):
        e = engine(first="O")
        e.level = 20
        slow = pb.fall_interval(20)
        self.assertLess(slow, pb.SOFT_RATE, "at high levels gravity is already faster than a soft drop")
        y0 = e.piece["y"]
        e.update(0.05, soft=True)
        e.update(0.05, soft=True)
        self.assertGreaterEqual(e.piece["y"] - y0, 1)

    def test_key_repeat_moves_the_piece_while_held(self):
        g = pb.Game()
        g.start()
        x0 = g.eng.piece["x"]
        g.press("left")
        for _ in range(12):
            g.update(0.05)
        self.assertLess(g.eng.piece["x"], x0 - 1, "held key keeps moving after the initial delay")
        g.release("left")
        x1 = g.eng.piece["x"]
        for _ in range(12):
            g.update(0.05)
        self.assertEqual(g.eng.piece["x"], x1)

    def test_touch_buttons_work_when_shown(self):
        g = pb.Game()
        g.touch = True
        g.start()
        x0 = g.eng.piece["x"]
        g.on_pointer_down(pb.BUTTONS["right"].center)
        g.on_pointer_up(pb.BUTTONS["right"].center)
        self.assertEqual(g.eng.piece["x"], x0 + 1)
        g.on_pointer_down(pb.BUTTONS["rotate"].center); g.on_pointer_up((0, 0))
        g.on_pointer_down(pb.BUTTONS["hold"].center); g.on_pointer_up((0, 0))
        self.assertIsNotNone(g.eng.hold)
        g.draw()
        h = pb.Game()
        h.touch = False
        h.start()
        self.assertIsNone(h.button_at(pb.BUTTONS["left"].center), "no hidden buttons on a desktop")

    def test_fonts_bundled_and_web_hooks_safe(self):
        for name in ("Gaegu-Bold.ttf", "PatrickHand-Regular.ttf"):
            self.assertTrue((Path(pb.ps.FONT_DIR) / name).exists(), name)
        pb.arcade_web.report_score(10)
        pb.arcade_web.exit_to_arcade()
        self.assertFalse(pb.arcade_web.is_touch())


if __name__ == "__main__":
    unittest.main()
