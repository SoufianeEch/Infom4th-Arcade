"""
PAPER BLOCKS - stack falling blocks, clear lines
------------------------------------------------
Classic falling-block puzzle on graph paper: 10x20 board, 7 pieces from a shuffled bag, SRS rotation with wall kicks,
ghost piece, hold, next queue, lock delay, levels, line-clear scoring. The rules live in `Engine` (no drawing, easy to test).

KEYS     LEFT / RIGHT move     DOWN soft drop     SPACE hard drop     UP / X rotate right     Z rotate left
         C / SHIFT hold        P pause            ESC menu
TOUCH    on-screen buttons appear on phones.

Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
Browser:  npm run build:py          (see ../README.md)
"""

import asyncio
import math
import random
import sys

import pygame

import arcade_web
import paper_style as ps

W, H = 1000, 640
FPS = 60
COLS, ROWS, VISIBLE = 10, 22, 20               # two hidden rows above the board
CELL = 28
LOCK_DELAY = 0.5                               # seconds on the ground before a piece locks
MAX_LOCK_RESETS = 15                           # moves/rotations that may restart the lock timer
CLEAR_TIME = 0.35                              # line-clear flash
LINES_PER_LEVEL = 10
DAS, ARR = 0.16, 0.045                         # left/right key-repeat delay and rate (seconds)
SOFT_DELAY = 0.16                              # holding DOWN: a tap moves one row; after this delay it keeps going...
SOFT_RATE = 0.09                               # ...at one row per 0.09 s (about 11 rows a second)
BEST_KEY = "infom4th.paper-blocks.best"

# SRS rotation states 0, R, 2, L as (x, y) cells inside the piece's box (y grows downwards).
SHAPES = {
    "I": [[(0, 1), (1, 1), (2, 1), (3, 1)], [(2, 0), (2, 1), (2, 2), (2, 3)], [(0, 2), (1, 2), (2, 2), (3, 2)], [(1, 0), (1, 1), (1, 2), (1, 3)]],
    "O": [[(1, 0), (2, 0), (1, 1), (2, 1)]] * 4,
    "T": [[(1, 0), (0, 1), (1, 1), (2, 1)], [(1, 0), (1, 1), (2, 1), (1, 2)], [(0, 1), (1, 1), (2, 1), (1, 2)], [(1, 0), (0, 1), (1, 1), (1, 2)]],
    "S": [[(1, 0), (2, 0), (0, 1), (1, 1)], [(1, 0), (1, 1), (2, 1), (2, 2)], [(1, 1), (2, 1), (0, 2), (1, 2)], [(0, 0), (0, 1), (1, 1), (1, 2)]],
    "Z": [[(0, 0), (1, 0), (1, 1), (2, 1)], [(2, 0), (1, 1), (2, 1), (1, 2)], [(0, 1), (1, 1), (1, 2), (2, 2)], [(1, 0), (0, 1), (1, 1), (0, 2)]],
    "J": [[(0, 0), (0, 1), (1, 1), (2, 1)], [(1, 0), (2, 0), (1, 1), (1, 2)], [(0, 1), (1, 1), (2, 1), (2, 2)], [(1, 0), (1, 1), (0, 2), (1, 2)]],
    "L": [[(2, 0), (0, 1), (1, 1), (2, 1)], [(1, 0), (1, 1), (1, 2), (2, 2)], [(0, 1), (1, 1), (2, 1), (0, 2)], [(0, 0), (1, 0), (1, 1), (1, 2)]],
}
KINDS = "IOTSZJL"

# SRS wall kicks, written as in the guideline (x right, y UP); they are flipped to our y-down grid when used.
_JLSTZ = {
    (0, 1): [(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)], (1, 0): [(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)],
    (1, 2): [(0, 0), (1, 0), (1, -1), (0, 2), (1, 2)], (2, 1): [(0, 0), (-1, 0), (-1, 1), (0, -2), (-1, -2)],
    (2, 3): [(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)], (3, 2): [(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)],
    (3, 0): [(0, 0), (-1, 0), (-1, -1), (0, 2), (-1, 2)], (0, 3): [(0, 0), (1, 0), (1, 1), (0, -2), (1, -2)],
}
_I = {
    (0, 1): [(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)], (1, 0): [(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)],
    (1, 2): [(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)], (2, 1): [(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)],
    (2, 3): [(0, 0), (2, 0), (-1, 0), (2, 1), (-1, -2)], (3, 2): [(0, 0), (-2, 0), (1, 0), (-2, -1), (1, 2)],
    (3, 0): [(0, 0), (1, 0), (-2, 0), (1, -2), (-2, 1)], (0, 3): [(0, 0), (-1, 0), (2, 0), (-1, 2), (2, -1)],
}
LINE_POINTS = [0, 100, 300, 500, 800]


def kicks(kind, frm, to):
    if kind == "O":
        return [(0, 0)]
    table = _I if kind == "I" else _JLSTZ
    return [(dx, -dy) for dx, dy in table[(frm, to)]]


def fall_interval(level):
    """Seconds per row of gravity (the guideline curve): level 1 = 0.8 s, getting fast quickly."""
    level = max(1, min(level, 20))
    return (0.8 - (level - 1) * 0.007) ** (level - 1)


class Engine:
    """All the rules, no drawing. `rng` (a random.Random) can be injected for tests."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.state = "menu"                     # menu -> playing <-> paused -> gameover
        self.events = []
        self.reset()

    def reset(self):
        self.grid = [[None] * COLS for _ in range(ROWS)]
        self.bag = []
        self.queue = []
        self.hold = None
        self.can_hold = True
        self.score = 0
        self.lines = 0
        self.level = 1
        self.combo = -1
        self.back_to_back = False
        self.fall_t = 0.0
        self.lock_t = 0.0
        self.lock_resets = 0
        self.lowest = 0
        self.clear_t = 0.0
        self.clearing = []                      # rows being flashed away
        self.piece = None                       # {"kind", "rot", "x", "y"}
        self.fill_queue()

    # ------------------------------------------------------------------ randomizer
    def next_from_bag(self):
        if not self.bag:
            self.bag = list(KINDS)
            self.rng.shuffle(self.bag)
        return self.bag.pop()

    def fill_queue(self, n=5):
        while len(self.queue) < n:
            self.queue.append(self.next_from_bag())

    # ------------------------------------------------------------------ geometry
    @staticmethod
    def cells(kind, rot, x, y):
        return [(x + cx, y + cy) for cx, cy in SHAPES[kind][rot % 4]]

    def fits(self, kind, rot, x, y):
        for cx, cy in self.cells(kind, rot, x, y):
            if cx < 0 or cx >= COLS or cy >= ROWS or cy < 0 or self.grid[cy][cx] is not None:
                return False
        return True

    def piece_cells(self):
        p = self.piece
        return self.cells(p["kind"], p["rot"], p["x"], p["y"]) if p else []

    def on_ground(self):
        p = self.piece
        return not self.fits(p["kind"], p["rot"], p["x"], p["y"] + 1)

    def ghost_y(self):
        p = self.piece
        y = p["y"]
        while self.fits(p["kind"], p["rot"], p["x"], y + 1):
            y += 1
        return y

    # ------------------------------------------------------------------ flow
    def new_game(self):
        self.reset()
        self.events.clear()
        self.state = "playing"
        self.spawn()

    def spawn(self, kind=None):
        kind = kind or self.queue.pop(0)
        self.fill_queue()
        self.piece = {"kind": kind, "rot": 0, "x": 3, "y": 0}
        self.can_hold = True
        self.fall_t = 0.0
        self.lock_t = 0.0
        self.lock_resets = 0
        self.lowest = 0
        if not self.fits(kind, 0, 3, 0):
            self.finish()
            return False
        if self.fits(kind, 0, 3, 1):             # the guideline drops a new piece one row straight away
            self.piece["y"] = 1
            self.lowest = 1
        return True

    def finish(self):
        self.state = "gameover"
        self.events.append({"type": "gameover", "score": self.score, "lines": self.lines, "level": self.level})

    def pause(self):
        if self.state == "playing":
            self.state = "paused"
        elif self.state == "paused":
            self.state = "playing"

    def active(self):
        return self.state == "playing" and self.piece is not None and not self.clearing

    # ------------------------------------------------------------------ player actions
    def _touched(self):
        """A successful move or rotation on the ground restarts the lock timer (a limited number of times)."""
        if self.on_ground() and self.lock_resets < MAX_LOCK_RESETS:
            self.lock_t = 0.0
            self.lock_resets += 1

    def move(self, dx):
        if not self.active():
            return False
        p = self.piece
        if self.fits(p["kind"], p["rot"], p["x"] + dx, p["y"]):
            p["x"] += dx
            self._touched()
            self.events.append({"type": "move"})
            return True
        return False

    def rotate(self, direction):
        """direction +1 = clockwise, -1 = counter-clockwise. Tries the SRS wall kicks in order."""
        if not self.active():
            return False
        p = self.piece
        new = (p["rot"] + direction) % 4
        for dx, dy in kicks(p["kind"], p["rot"], new):
            if self.fits(p["kind"], new, p["x"] + dx, p["y"] + dy):
                p["rot"], p["x"], p["y"] = new, p["x"] + dx, p["y"] + dy
                self._touched()
                self.events.append({"type": "rotate"})
                return True
        return False

    def soft_drop(self):
        """One row down by the player: +1 point."""
        if not self.active():
            return False
        p = self.piece
        if self.fits(p["kind"], p["rot"], p["x"], p["y"] + 1):
            p["y"] += 1
            self.score += 1
            self._fell()
            return True
        return False

    def hard_drop(self):
        if not self.active():
            return 0
        p = self.piece
        y = self.ghost_y()
        dist = y - p["y"]
        p["y"] = y
        self.score += 2 * dist
        self.events.append({"type": "drop", "dist": dist, "cells": self.piece_cells()})
        self.lock()
        return dist

    def hold_piece(self):
        if not self.active() or not self.can_hold:
            return False
        kind = self.piece["kind"]
        if self.hold is None:
            self.hold = kind
            self.spawn()
        else:
            self.hold, swap = kind, self.hold
            self.spawn(swap)
        self.can_hold = False
        self.events.append({"type": "hold"})
        return True

    def _fell(self):
        if self.piece["y"] > self.lowest:         # reaching a new lowest row gives a fresh lock timer
            self.lowest = self.piece["y"]
            self.lock_t = 0.0
            self.lock_resets = 0

    # ------------------------------------------------------------------ locking and clearing
    def lock(self):
        p = self.piece
        cells = self.piece_cells()
        for cx, cy in cells:
            self.grid[cy][cx] = p["kind"]
        self.events.append({"type": "lock", "cells": cells, "kind": p["kind"]})
        self.piece = None
        if all(cy < ROWS - VISIBLE for _, cy in cells):          # locked completely above the board
            self.finish()
            return
        full = [y for y in range(ROWS) if all(c is not None for c in self.grid[y])]
        if full:
            self.clearing = full
            self.clear_t = CLEAR_TIME
            self.score_lines(len(full))
        else:
            self.combo = -1
            self.spawn()

    def score_lines(self, n):
        points = LINE_POINTS[n] * self.level
        tetris = n == 4
        if tetris and self.back_to_back:
            points = int(points * 1.5)
        self.back_to_back = tetris if n else self.back_to_back
        self.combo += 1
        points += 50 * self.combo * self.level
        self.score += points
        self.lines += n
        self.events.append({"type": "clear", "n": n, "rows": list(self.clearing), "points": points, "combo": self.combo, "b2b": tetris and points > LINE_POINTS[4] * self.level})
        new_level = 1 + self.lines // LINES_PER_LEVEL
        if new_level > self.level:
            self.level = new_level
            self.events.append({"type": "level", "level": self.level})

    def finish_clear(self):
        for y in sorted(self.clearing):
            del self.grid[y]
            self.grid.insert(0, [None] * COLS)
        self.clearing = []
        self.clear_t = 0.0
        self.spawn()

    # ------------------------------------------------------------------ time
    def update(self, dt, soft=False):
        dt = min(dt, 0.05)
        if self.state != "playing":
            return
        if self.clearing:
            self.clear_t -= dt
            if self.clear_t <= 0:
                self.finish_clear()
            return
        if self.piece is None:
            return
        interval = fall_interval(self.level)
        if soft:
            interval = min(interval, SOFT_RATE)          # soft drop is a steady, controllable speed (never slower than gravity itself)
        self.fall_t += dt
        while self.piece is not None and self.fall_t >= interval:
            self.fall_t -= interval
            p = self.piece
            if self.fits(p["kind"], p["rot"], p["x"], p["y"] + 1):
                p["y"] += 1
                if soft:
                    self.score += 1
                self._fell()
            else:
                break
        if self.piece is not None and self.on_ground():
            self.lock_t += dt
            if self.lock_t >= LOCK_DELAY:
                self.lock()
        elif self.piece is not None:
            self.lock_t = 0.0


# ---------------------------------------------------------------------- game (drawing, input)
PIECE_COLORS = {"I": (0, 166, 214), "O": (255, 212, 59), "T": (155, 93, 229), "S": (106, 160, 0), "Z": (230, 57, 70), "J": (45, 107, 255), "L": (255, 123, 0)}
BOARD_X, BOARD_Y = 360, 40
KEY_ACTIONS = {pygame.K_LEFT: "left", pygame.K_a: "left", pygame.K_RIGHT: "right", pygame.K_d: "right", pygame.K_DOWN: "down", pygame.K_s: "down"}

# on-screen buttons (shown on touch screens)
BUTTONS = {
    "left": pygame.Rect(24, 470, 96, 96), "right": pygame.Rect(236, 470, 96, 96), "down": pygame.Rect(130, 520, 96, 96),
    "rotate": pygame.Rect(790, 470, 96, 96), "drop": pygame.Rect(890, 520, 96, 96), "hold": pygame.Rect(890, 410, 96, 96),
}


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Paper Blocks")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.eng = Engine()
        self.background = ps.grid_surface(W, H)
        self.f_title = ps.title(110)
        self.f_big = ps.title(56)
        self.f_hud = ps.title(40)
        self.f_mid = ps.body(32)
        self.f_small = ps.body(22)
        self.best = int(arcade_web.store_get(BEST_KEY, 0) or 0)
        self.touch = arcade_web.is_touch()
        self.held = set()                       # "left" / "right" / "down" currently held
        self.das = 0.0
        self.das_dir = 0
        self.down_t = 0.0                       # how long DOWN has been held
        self.popups = []                        # [text, x, y, life, color]
        self.bursts = []                        # [x, y, vx, vy, life, color]
        self.shake = 0.0
        self.final = None

    # ------------------------------------------------------------ events -> effects
    def handle_events(self):
        for ev in self.eng.events:
            t = ev["type"]
            if t == "clear":
                names = {1: "single", 2: "DOUBLE", 3: "TRIPLE", 4: "FOUR LINES!"}
                label = names[ev["n"]] + ("  back-to-back!" if ev["b2b"] else "")
                self.popups.append([f"{label}  +{ev['points']}", BOARD_X + COLS * CELL // 2, BOARD_Y + 220, 1.4, ps.BLUE if ev["n"] < 4 else ps.RED])
                for row in ev["rows"]:
                    for _ in range(14):
                        a = random.uniform(0, math.tau)
                        speed = random.uniform(80, 320)
                        self.bursts.append([BOARD_X + random.random() * COLS * CELL, BOARD_Y + (row - (ROWS - VISIBLE) + 0.5) * CELL, speed * math.cos(a), speed * math.sin(a) - 80, random.uniform(0.3, 0.8), random.choice(list(PIECE_COLORS.values()))])
                if ev["n"] >= 3:
                    self.shake = 0.25
            elif t == "drop" and ev["dist"] > 2:
                self.shake = max(self.shake, 0.08)
            elif t == "level":
                self.popups.append([f"LEVEL {ev['level']}", BOARD_X + COLS * CELL // 2, BOARD_Y + 120, 1.6, ps.GREEN])
            elif t == "gameover":
                self.final = ev["score"]
                if ev["score"] > self.best:
                    self.best = ev["score"]
                    arcade_web.store_set(BEST_KEY, self.best)
                arcade_web.report_score(ev["score"])
        self.eng.events.clear()

    def update(self, dt):
        e = self.eng
        if e.state == "playing" and not e.clearing:
            if self.das_dir:
                self.das -= dt
                while self.das <= 0 and self.das_dir:
                    e.move(self.das_dir)
                    self.das += ARR
        if "down" in self.held:
            self.down_t += dt
        e.update(dt, soft="down" in self.held and self.down_t >= SOFT_DELAY)
        self.handle_events()
        self.shake = max(0.0, self.shake - dt)
        for p in self.popups:
            p[2] -= 30 * dt
            p[3] -= dt
        self.popups = [p for p in self.popups if p[3] > 0]
        for b in self.bursts:
            b[0] += b[2] * dt
            b[1] += b[3] * dt
            b[3] += 600 * dt
            b[4] -= dt
        self.bursts = [b for b in self.bursts if b[4] > 0]

    # ------------------------------------------------------------ input
    def press(self, action):
        e = self.eng
        if e.state in ("menu", "gameover"):
            if action in ("rotate", "drop", "start"):
                self.start()
            return
        if action == "pause":
            e.pause()
            return
        if e.state == "paused":
            if action in ("rotate", "drop"):
                e.pause()
            return
        if action == "left" or action == "right":
            d = -1 if action == "left" else 1
            self.held.add(action)
            self.held.discard("right" if action == "left" else "left")
            self.das_dir, self.das = d, DAS
            e.move(d)
        elif action == "down":
            self.held.add("down")
            self.down_t = 0.0
            e.soft_drop()
        elif action == "rotate":
            e.rotate(1)
        elif action == "rotate_ccw":
            e.rotate(-1)
        elif action == "drop":
            e.hard_drop()
        elif action == "hold":
            e.hold_piece()

    def release(self, action):
        self.held.discard(action)
        if action in ("left", "right"):
            if "left" in self.held:
                self.das_dir, self.das = -1, DAS
            elif "right" in self.held:
                self.das_dir, self.das = 1, DAS
            else:
                self.das_dir = 0

    def on_key(self, event):
        k = event.key
        if k == pygame.K_ESCAPE:
            self.quit()
        elif k in KEY_ACTIONS:
            self.press(KEY_ACTIONS[k])
        elif k in (pygame.K_UP, pygame.K_x, pygame.K_w):
            self.press("rotate")
        elif k == pygame.K_z:
            self.press("rotate_ccw")
        elif k == pygame.K_SPACE:
            self.press("drop" if self.eng.state not in ("menu", "gameover") else "start")
        elif k in (pygame.K_c, pygame.K_LSHIFT, pygame.K_RSHIFT):
            self.press("hold")
        elif k == pygame.K_p:
            self.press("pause")
        elif k == pygame.K_RETURN and self.eng.state in ("menu", "gameover"):
            self.start()

    def on_key_up(self, event):
        if event.key in KEY_ACTIONS:
            self.release(KEY_ACTIONS[event.key])

    def button_at(self, pos):
        if not self.touch:
            return None
        for name, r in BUTTONS.items():
            if r.collidepoint(pos):
                return name
        return None

    def on_pointer_down(self, pos):
        e = self.eng
        if e.state in ("menu", "gameover", "paused"):
            self.press("start" if e.state != "paused" else "rotate")
            return
        name = self.button_at(pos)
        self.pointer = name
        if name:
            self.press(name)

    def on_pointer_up(self, pos):
        name, self.pointer = getattr(self, "pointer", None), None
        if name:
            self.release(name)

    def start(self):
        self.eng.new_game()
        self.held.clear()
        self.das_dir = 0
        self.popups.clear()
        self.bursts.clear()
        self.final = None

    def quit(self):
        if arcade_web.WEB:
            arcade_web.exit_to_arcade()
            return
        pygame.quit()
        sys.exit()

    # ------------------------------------------------------------ drawing
    def paper_page(self):
        self.screen.blit(self.background, (0, 0))
        pygame.draw.line(self.screen, ps.RED, (70, 0), (70, H), 2)

    def cell_rect(self, cx, cy):
        """Screen rectangle of board cell (cx, cy); rows above ROWS-VISIBLE are hidden."""
        return pygame.Rect(BOARD_X + cx * CELL, BOARD_Y + (cy - (ROWS - VISIBLE)) * CELL, CELL, CELL)

    def draw_block(self, surf, rect, color, ghost=False, flash=False):
        r = rect.inflate(-2, -2)
        if ghost:
            pygame.draw.rect(surf, color, r, width=2, border_radius=5)
            return
        pygame.draw.rect(surf, ps.HL if flash else color, r, border_radius=5)
        pygame.draw.rect(surf, ps.INK, r, width=2, border_radius=5)
        pygame.draw.line(surf, (255, 255, 255), (r.left + 5, r.top + 4), (r.right - 6, r.top + 4), 2)       # lit top edge

    def draw_mini(self, kind, center, size=22):
        cells = SHAPES[kind][0]
        xs, ys = [c[0] for c in cells], [c[1] for c in cells]
        w, h = (max(xs) - min(xs) + 1) * size, (max(ys) - min(ys) + 1) * size
        for cx, cy in cells:
            r = pygame.Rect(center[0] - w // 2 + (cx - min(xs)) * size, center[1] - h // 2 + (cy - min(ys)) * size, size, size)
            self.draw_block(self.screen, r, PIECE_COLORS[kind])

    def draw_board(self):
        e = self.eng
        s = self.screen
        board = pygame.Rect(BOARD_X, BOARD_Y, COLS * CELL, VISIBLE * CELL)
        ps.card(s, board.inflate(12, 12), seed=3, width=3)
        pygame.draw.rect(s, ps.CARD, board)
        for x in range(COLS + 1):
            pygame.draw.line(s, ps.GRID, (board.left + x * CELL, board.top), (board.left + x * CELL, board.bottom))
        for y in range(VISIBLE + 1):
            pygame.draw.line(s, ps.GRID, (board.left, board.top + y * CELL), (board.right, board.top + y * CELL))
        blink = int(pygame.time.get_ticks() / 90) % 2 == 0
        for y in range(ROWS - VISIBLE, ROWS):
            for x in range(COLS):
                kind = e.grid[y][x]
                if kind:
                    self.draw_block(s, self.cell_rect(x, y), PIECE_COLORS[kind], flash=bool(e.clearing) and y in e.clearing and blink)
        if e.piece:
            gy = e.ghost_y()
            p = e.piece
            for cx, cy in Engine.cells(p["kind"], p["rot"], p["x"], gy):
                if cy >= ROWS - VISIBLE:
                    self.draw_block(s, self.cell_rect(cx, cy), PIECE_COLORS[p["kind"]], ghost=True)
            for cx, cy in e.piece_cells():
                if cy >= ROWS - VISIBLE:
                    self.draw_block(s, self.cell_rect(cx, cy), PIECE_COLORS[p["kind"]])

    def draw_panels(self):
        e = self.eng
        s = self.screen
        hold = pygame.Rect(150, 60, 170, 130)
        ps.card(s, hold, fill=ps.CARD if e.can_hold else ps.PAPER, seed=7)
        ps.text(s, "HOLD", self.f_small, ps.INK_SOFT, (hold.centerx, hold.top + 18))
        if e.hold:
            self.draw_mini(e.hold, (hold.centerx, hold.centery + 12))
        nxt = pygame.Rect(680, 60, 170, 330)
        ps.card(s, nxt, seed=11)
        ps.text(s, "NEXT", self.f_small, ps.INK_SOFT, (nxt.centerx, nxt.top + 18))
        for i, kind in enumerate(e.queue[:4]):
            self.draw_mini(kind, (nxt.centerx, nxt.top + 80 + i * 74), size=22 if i == 0 else 18)
        stats = [("SCORE", e.score, ps.INK), ("LEVEL", e.level, ps.BLUE), ("LINES", e.lines, ps.INK)]
        for i, (label, value, color) in enumerate(stats):
            y = 235 + i * 82
            ps.text(s, label, self.f_small, ps.INK_SOFT, (150, y), "midleft")
            ps.text(s, f"{value}", self.f_hud, color, (150, y + 32), "midleft")
        ps.text(s, f"best {self.best}", self.f_small, ps.INK_SOFT, (150, 490), "midleft")
        if not self.touch:
            for i, line in enumerate(["LEFT / RIGHT  move     DOWN  soft drop", "UP or X  rotate     Z  rotate back", "SPACE  hard drop     C  hold", "P  pause"]):
                ps.text(s, line, ps.body(20), ps.INK_FAINT, (680, 430 + i * 28), "midleft")

    def draw_buttons(self):
        if not self.touch:
            return
        for name, r in BUTTONS.items():
            down = name in self.held or getattr(self, "pointer", None) == name
            rr = r.move(0, 4 if down else 0)
            ps.pill(self.screen, rr, ps.HL if down else ps.CARD, shadow=not down, radius=18, width=3)
            self.draw_icon(name, rr)

    def draw_icon(self, name, r):
        """Button icons are drawn as shapes: the handwriting fonts have no arrow symbols."""
        s, c, k = self.screen, r.center, r.w // 4
        ink = ps.INK
        if name in ("left", "right", "down"):
            pts = {"left": [(c[0] + k, c[1] - k), (c[0] + k, c[1] + k), (c[0] - k, c[1])],
                   "right": [(c[0] - k, c[1] - k), (c[0] - k, c[1] + k), (c[0] + k, c[1])],
                   "down": [(c[0] - k, c[1] - k), (c[0] + k, c[1] - k), (c[0], c[1] + k)]}[name]
            pygame.draw.polygon(s, ink, pts)
        elif name == "rotate":
            box = pygame.Rect(0, 0, k * 2.4, k * 2.4)
            box.center = c
            pygame.draw.arc(s, ink, box, math.radians(40), math.radians(320), 6)
            tip = (box.right - 2, c[1] - 2)
            pygame.draw.polygon(s, ink, [(tip[0] - k * 0.7, tip[1] - k * 0.3), (tip[0] + k * 0.5, tip[1] - k * 0.3), (tip[0] - k * 0.1, tip[1] + k * 0.6)])
        elif name == "drop":
            pygame.draw.polygon(s, ink, [(c[0] - k, c[1] - k * 1.1), (c[0] + k, c[1] - k * 1.1), (c[0], c[1] - k * 0.1)])
            pygame.draw.polygon(s, ink, [(c[0] - k, c[1] + k * 0.1), (c[0] + k, c[1] + k * 0.1), (c[0], c[1] + k * 1.1)])
        else:
            ps.text(s, "HOLD", self.f_small, ink, c)

    def draw_world(self):
        e = self.eng
        self.screen.blit(self.background, (0, 0))
        self.draw_board()
        self.draw_panels()
        for x, y, vx, vy, life, color in self.bursts:
            pygame.draw.rect(self.screen, color, (int(x), int(y), max(3, int(life * 10)), max(3, int(life * 10))))
        for text, x, y, life, color in self.popups:
            ps.text(self.screen, text, self.f_hud, color, (x, y))
        self.draw_buttons()

    def draw(self):
        e = self.eng
        if e.state == "menu":
            self.paper_page()
            ps.text(self.screen, "PAPER BLOCKS", self.f_title, ps.BLUE, (W // 2, 100))
            ps.text(self.screen, "Stack the falling blocks. Clear lines.", self.f_mid, ps.INK_SOFT, (W // 2, 170))
            for i, tip in enumerate(["Arrow keys move and drop, up or X rotates, Z rotates back.", "SPACE hard-drops, C holds a piece for later.",
                                     "Fill a row to clear it. Four at once scores big!", "On a phone, use the buttons on the sides."]):
                ps.text(self.screen, tip, self.f_mid, ps.INK, (W // 2, 245 + i * 40))
            for k, kind in enumerate("TLJZS"):
                self.draw_mini(kind, (W // 2 - 200 + k * 100, 430), size=20)
            btn = pygame.Rect(0, 0, 460, 64)
            btn.center = (W // 2, 520)
            ps.pill(self.screen, btn, ps.BLUE)
            ps.text(self.screen, "Press SPACE or tap to start", self.f_hud, ps.ON_BLUE, btn.center)
            ps.text(self.screen, f"best {self.best}", self.f_mid, ps.INK_SOFT, (W // 2, 585))
        else:
            self.draw_world()
            if e.state == "paused":
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 225))
                self.screen.blit(veil, (0, 0))
                box = pygame.Rect(0, 0, 440, 100)
                box.center = (W // 2, H // 2)
                ps.card(self.screen, box)
                ps.text(self.screen, "PAUSED  (P to resume)", self.f_hud, ps.INK, box.center)
            elif e.state == "gameover":
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 232))
                self.screen.blit(veil, (0, 0))
                pygame.draw.line(self.screen, ps.RED, (70, 0), (70, H), 2)
                ps.text(self.screen, "GAME OVER", self.f_title, ps.RED, (W // 2, 130))
                ps.text(self.screen, f"Score {self.final}   -   Lines {e.lines}   -   Level {e.level}", self.f_big, ps.INK, (W // 2, 250))
                new_best = self.final is not None and self.final >= self.best and self.final > 0
                ps.text(self.screen, "New personal best!" if new_best else f"Best {self.best}", self.f_mid, ps.BLUE, (W // 2, 320))
                ps.text(self.screen, "Your score was sent to the arcade leaderboard.", self.f_small, ps.INK_SOFT, (W // 2, 372))
                ps.text(self.screen, "SPACE / tap: play again     ESC: menu", self.f_mid, ps.BLUE, (W // 2, 520))
        if self.shake > 0:
            self.screen.scroll(random.randint(-4, 4), random.randint(-4, 4))
        pygame.display.flip()

    # ------------------------------------------------------------ main loop
    async def run(self):
        # async + `await asyncio.sleep(0)` hands control back to the browser each frame;
        # on the desktop it behaves like a normal blocking loop.
        while True:
            dt = min(self.clock.tick(FPS) / 1000, 0.05)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.quit()
                elif event.type == pygame.KEYDOWN:
                    self.on_key(event)
                elif event.type == pygame.KEYUP:
                    self.on_key_up(event)
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.on_pointer_down(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP and event.button == 1:
                    self.on_pointer_up(event.pos)
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)


async def main():
    await Game().run()


if __name__ == "__main__":
    asyncio.run(main())
