"""
BINARY BLOCKS - flip the bits, match the number
-----------------------------------------------
Decimal number blocks fall toward the ground. Eight bit switches (128 64 32 16 8 4 2 1) build a byte.
Make the byte equal to a falling number and LOCK it to blow the block up. Let blocks hit the ground and you lose a life.

KEYS     1-8 flip the switches (left to right)    SPACE / ENTER lock    BACKSPACE / C clear    P pause    ESC menu
MOUSE    tap a switch to flip it, tap LOCK to lock.

Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
Browser:  npm run build:py          (see ../README.md)

To change the difficulty, edit LEVELS / the constants below.
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
BITS = 8
LIVES = 3
GROUND_Y = 372                 # a block that reaches this line is a miss
CLEAR_PER_LEVEL = 5            # blocks to clear for the next level
BEST_KEY = "infom4th.binary-blocks.best"
LANES = 6
LANE_X0, LANE_W = 70, 860 // LANES
BLOCK_W, BLOCK_H = 118, 58


def max_value(level):
    """Largest number a block can show: level 1 needs 3 bits, then it grows to the full byte."""
    return min(255, (1 << (level + 2)) - 1)


class Engine:
    """All the rules, no drawing. `random_fn` and `rng` can be injected for tests."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.state = "menu"                  # menu -> playing <-> paused -> gameover
        self.events = []
        self.reset()

    def reset(self):
        self.bits = [0] * BITS
        self.blocks = []                     # {"value", "lane", "y"}
        self.score = 0
        self.lives = LIVES
        self.level = 1
        self.cleared = 0
        self.combo = 0
        self.spawn_t = 0.5
        self.time = 0.0
        self.flash = 0.0                     # red flash after a wrong lock
        self.last_value = None

    # -------------------------------------------------------------- queries
    @property
    def value(self):
        return sum(b << (BITS - 1 - i) for i, b in enumerate(self.bits))

    @property
    def speed(self):
        return min(34 + 7 * self.level, 120)

    @property
    def spawn_interval(self):
        return max(1.5, 4.2 - 0.3 * self.level)

    @property
    def max_blocks(self):
        return min(2 + self.level // 2, 5)

    # -------------------------------------------------------------- actions
    def new_game(self):
        self.reset()
        self.state = "playing"
        self.events.clear()

    def toggle(self, i):
        if self.state == "playing" and 0 <= i < BITS:
            self.bits[i] ^= 1

    def clear_bits(self):
        if self.state == "playing":
            self.bits = [0] * BITS

    def pause(self):
        if self.state == "playing":
            self.state = "paused"
        elif self.state == "paused":
            self.state = "playing"

    def lock(self):
        """Fire the current byte. Returns 'hit', 'miss' (nothing matched) or None (not playing)."""
        if self.state != "playing":
            return None
        v = self.value
        matches = [b for b in self.blocks if b["value"] == v]
        if not matches:
            self.combo = 0
            self.flash = 0.35
            self.events.append({"type": "wrong", "value": v})
            return "miss"
        block = max(matches, key=lambda b: b["y"])          # the lowest one is the most urgent
        self.blocks.remove(block)
        height_bonus = max(0, int((GROUND_Y - block["y"]) / 20))
        points = (10 * max(1, v.bit_length()) + height_bonus) * (1 + self.combo // 3)
        self.score += points
        self.combo += 1
        self.cleared += 1
        self.bits = [0] * BITS
        self.events.append({"type": "clear", "value": v, "lane": block["lane"], "y": block["y"], "points": points})
        if self.cleared % CLEAR_PER_LEVEL == 0:
            self.level += 1
            self.events.append({"type": "level", "level": self.level})
        return "hit"

    # -------------------------------------------------------------- time
    def update(self, dt):
        dt = min(dt, 0.05)
        if self.state != "playing":
            return
        self.time += dt
        self.flash = max(0.0, self.flash - dt)
        for b in list(self.blocks):
            b["y"] += self.speed * dt
            if b["y"] >= GROUND_Y:
                self.blocks.remove(b)
                self.lives -= 1
                self.combo = 0
                self.events.append({"type": "miss", "lane": b["lane"], "value": b["value"]})
                if self.lives <= 0:
                    self.state = "gameover"
                    self.events.append({"type": "gameover", "score": self.score, "level": self.level})
                    return
        self.spawn_t -= dt
        if self.spawn_t <= 0 and len(self.blocks) < self.max_blocks:
            self.spawn_t = self.spawn_interval
            self.spawn()
        elif self.spawn_t <= 0:
            self.spawn_t = 0.3

    def spawn(self):
        free = [i for i in range(LANES) if not any(b["lane"] == i and b["y"] < 120 for b in self.blocks)]
        if not free:
            return None
        used = {b["value"] for b in self.blocks}
        top = max_value(self.level)
        value = self.rng.randint(1, top)
        for _ in range(12):                                   # avoid two identical numbers on screen
            if value not in used:
                break
            value = self.rng.randint(1, top)
        block = {"value": value, "lane": self.rng.choice(free), "y": 70.0}
        self.blocks.append(block)
        return block


# ---------------------------------------------------------------- layout (shared by drawing and hit tests)
SW_W, SW_H, SW_GAP = 82, 92, 10
SW_X0 = 64
SW_Y = 508
SWITCHES = [pygame.Rect(SW_X0 + i * (SW_W + SW_GAP), SW_Y, SW_W, SW_H) for i in range(BITS)]
LOCK_RECT = pygame.Rect(SW_X0 + BITS * (SW_W + SW_GAP) + 8, SW_Y, 150, 92)
CLEAR_RECT = pygame.Rect(LOCK_RECT.x, SW_Y - 48, 150, 38)


def block_rect(b):
    return pygame.Rect(LANE_X0 + b["lane"] * LANE_W + (LANE_W - BLOCK_W) // 2, int(b["y"]), BLOCK_W, BLOCK_H)


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Binary Blocks")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.eng = Engine()
        self.background = ps.grid_surface(W, H)
        self.f_title = ps.title(110)
        self.f_big = ps.title(56)
        self.f_hud = ps.title(40)
        self.f_mid = ps.body(32)
        self.f_small = ps.body(22)
        self.f_bit = ps.mono(44, bold=True)
        self.f_place = ps.mono(20)
        self.f_block = ps.title(44)
        self.best = int(arcade_web.store_get(BEST_KEY, 0) or 0)
        self.popups = []                    # [text, x, y, life, color]
        self.bursts = []                    # [x, y, vx, vy, life]
        self.shake = 0.0
        self.final = None

    # ------------------------------------------------------------ events -> effects
    def handle_events(self):
        for ev in self.eng.events:
            t = ev["type"]
            if t == "clear":
                x = LANE_X0 + ev["lane"] * LANE_W + LANE_W // 2
                self.popups.append([f"+{ev['points']}", x, ev["y"], 1.0, ps.GREEN])
                for _ in range(18):
                    a = random.uniform(0, math.tau)
                    speed = random.uniform(60, 220)
                    self.bursts.append([x, ev["y"] + 28, speed * math.cos(a), speed * math.sin(a), random.uniform(0.3, 0.7)])
            elif t == "miss":
                self.shake = 0.3
                self.popups.append(["missed!", LANE_X0 + ev["lane"] * LANE_W + LANE_W // 2, GROUND_Y - 30, 1.0, ps.RED])
            elif t == "level":
                self.popups.append([f"LEVEL {ev['level']}", W // 2, 250, 1.4, ps.BLUE])
            elif t == "gameover":
                self.final = ev["score"]
                if ev["score"] > self.best:
                    self.best = ev["score"]
                    arcade_web.store_set(BEST_KEY, self.best)
                arcade_web.report_score(ev["score"])
        self.eng.events.clear()

    def update(self, dt):
        self.eng.update(dt)
        self.handle_events()
        self.shake = max(0.0, self.shake - dt)
        for p in self.popups:
            p[2] -= 40 * dt
            p[3] -= dt
        self.popups = [p for p in self.popups if p[3] > 0]
        for b in self.bursts:
            b[0] += b[2] * dt
            b[1] += b[3] * dt
            b[4] -= dt
        self.bursts = [b for b in self.bursts if b[4] > 0]

    # ------------------------------------------------------------ input
    def on_key(self, event):
        e = self.eng
        k = event.key
        if k == pygame.K_ESCAPE:
            self.quit()
        elif e.state in ("menu", "gameover"):
            if k in (pygame.K_SPACE, pygame.K_RETURN):
                self.start()
        elif k == pygame.K_p:
            e.pause()
        elif e.state == "playing":
            if pygame.K_1 <= k <= pygame.K_8:
                e.toggle(k - pygame.K_1)
            elif k in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER):
                e.lock()
            elif k in (pygame.K_BACKSPACE, pygame.K_c):
                e.clear_bits()

    def on_pointer(self, pos):
        e = self.eng
        if e.state in ("menu", "gameover"):
            self.start()
            return
        if e.state == "paused":
            e.pause()
            return
        for i, r in enumerate(SWITCHES):
            if r.collidepoint(pos):
                e.toggle(i)
                return
        if LOCK_RECT.collidepoint(pos):
            e.lock()
        elif CLEAR_RECT.collidepoint(pos):
            e.clear_bits()

    def start(self):
        self.eng.new_game()
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

    def draw_block(self, b):
        r = block_rect(b)
        near = b["y"] > GROUND_Y - 120
        ps.card(self.screen, r, fill=ps.HL if near else ps.CARD, border=ps.RED if near else ps.INK, seed=b["value"] * 13 + b["lane"])
        ps.text(self.screen, b["value"], self.f_block, ps.INK, r.center)

    def draw_switches(self):
        e = self.eng
        for i, r in enumerate(SWITCHES):
            on = e.bits[i]
            place = 1 << (BITS - 1 - i)
            ps.text(self.screen, place, self.f_place, ps.INK_SOFT, (r.centerx, r.top - 14))
            key_r = r.move(0, 5 if on else 0)
            ps.pill(self.screen, key_r, ps.BLUE if on else ps.CARD, shadow=not on, radius=12, width=3)
            ps.text(self.screen, "1" if on else "0", self.f_bit, ps.ON_BLUE if on else ps.INK_FAINT, key_r.center)
            ps.text(self.screen, str(i + 1), self.f_small, ps.ON_BLUE if on else ps.INK_FAINT, (key_r.centerx, key_r.bottom - 14))
        # readout
        v = e.value
        ps.text(self.screen, f"= {v}", self.f_hud, ps.INK, (SW_X0 + 2 * (SW_W + SW_GAP), SW_Y - 62), "midleft")
        ps.text(self.screen, f"0x{v:02X}", self.f_small, ps.INK_SOFT, (SW_X0 + 4 * (SW_W + SW_GAP) + 20, SW_Y - 58), "midleft")
        # buttons
        ps.pill(self.screen, CLEAR_RECT, ps.CARD, radius=10)
        ps.text(self.screen, "clear", self.f_mid, ps.INK, CLEAR_RECT.center)
        lock_fill = ps.RED if e.flash > 0 else ps.BLUE
        ps.pill(self.screen, LOCK_RECT, lock_fill, radius=14, width=3)
        ps.text(self.screen, "LOCK", self.f_big, ps.ON_BLUE, LOCK_RECT.center)

    def draw_hud(self):
        e = self.eng
        ps.text(self.screen, f"Score {e.score}", self.f_hud, ps.INK, (90, 26), "midleft")
        ps.text(self.screen, f"Level {e.level}", self.f_hud, ps.BLUE, (W // 2, 26))
        for i in range(e.lives):
            cx = W - 50 - i * 34
            pygame.draw.circle(self.screen, ps.RED, (cx, 26), 12)
            pygame.draw.circle(self.screen, ps.INK, (cx, 26), 12, 2)
        ps.text(self.screen, f"best {self.best}", self.f_small, ps.INK_SOFT, (90, 56), "midleft")
        if e.combo >= 2:
            ps.text(self.screen, f"combo x{1 + e.combo // 3}  ({e.combo})", self.f_small, ps.GREEN, (W - 90, 56), "midright")

    def draw_world(self):
        e = self.eng
        self.screen.blit(self.background, (0, 0))
        # ground: a pencil line with hatching
        pygame.draw.line(self.screen, ps.RED, (40, GROUND_Y + BLOCK_H // 2 + 6), (W - 40, GROUND_Y + BLOCK_H // 2 + 6), 3)
        for x in range(40, W - 40, 24):
            pygame.draw.line(self.screen, ps.RED, (x, GROUND_Y + BLOCK_H // 2 + 8), (x - 10, GROUND_Y + BLOCK_H // 2 + 20), 2)
        for b in sorted(e.blocks, key=lambda b: b["y"]):
            self.draw_block(b)
        for x, y, vx, vy, life in self.bursts:
            pygame.draw.circle(self.screen, ps.BLUE, (int(x), int(y)), max(2, int(life * 9)))
        for text, x, y, life, color in self.popups:
            ps.text(self.screen, text, self.f_hud, color, (x, y))
        self.draw_hud()
        self.draw_switches()

    def draw(self):
        e = self.eng
        if e.state == "menu":
            self.paper_page()
            ps.text(self.screen, "BINARY BLOCKS", self.f_title, ps.BLUE, (W // 2, 100))
            ps.text(self.screen, "Flip the bits. Match the number.", self.f_mid, ps.INK_SOFT, (W // 2, 170))
            for i, tip in enumerate(["Numbers fall. Build the same number with the 8 bit switches.",
                                     "Keys 1-8 flip the switches (or tap them). SPACE locks.",
                                     "Each switch is worth 128, 64, 32, 16, 8, 4, 2, 1.",
                                     "Let a block touch the ground and you lose a life."]):
                ps.text(self.screen, tip, self.f_mid, ps.INK, (W // 2, 240 + i * 40))
            btn = pygame.Rect(0, 0, 460, 64)
            btn.center = (W // 2, 460)
            ps.pill(self.screen, btn, ps.BLUE)
            ps.text(self.screen, "Press SPACE or tap to start", self.f_hud, ps.ON_BLUE, btn.center)
            ps.text(self.screen, f"best {self.best}", self.f_mid, ps.INK_SOFT, (W // 2, 540))
        else:
            self.draw_world()
            if e.state == "paused":
                box = pygame.Rect(0, 0, 420, 90)
                box.center = (W // 2, 240)
                ps.card(self.screen, box)
                ps.text(self.screen, "PAUSED  (P to resume)", self.f_hud, ps.INK, box.center)
            elif e.state == "gameover":
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 232))
                self.screen.blit(veil, (0, 0))
                pygame.draw.line(self.screen, ps.RED, (70, 0), (70, H), 2)
                ps.text(self.screen, "GAME OVER", self.f_title, ps.RED, (W // 2, 140))
                ps.text(self.screen, f"Score {self.final}   -   Level {e.level}", self.f_big, ps.INK, (W // 2, 250))
                new_best = self.final is not None and self.final >= self.best and self.final > 0
                ps.text(self.screen, "New personal best!" if new_best else f"Best {self.best}", self.f_mid, ps.BLUE, (W // 2, 320))
                ps.text(self.screen, "Your score was sent to the arcade leaderboard.", self.f_small, ps.INK_SOFT, (W // 2, 372))
                ps.text(self.screen, "SPACE / tap: play again     ESC: menu", self.f_mid, ps.BLUE, (W // 2, 520))
        if self.shake > 0:
            self.screen.scroll(random.randint(-5, 5), random.randint(-5, 5))
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
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.on_pointer(event.pos)
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)


async def main():
    await Game().run()


if __name__ == "__main__":
    asyncio.run(main())
