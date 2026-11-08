"""
VARIABLE SHOOTER - type the Python before it lands (a ZType-style typing shooter)
----------------------------------------------------------------------------------
Python keywords, built-ins and tiny snippets fall from the top. Type one and your ship blasts it.
The first letter you type locks the lowest word that starts with it; finish the word to destroy it.
A wrong key breaks your combo. Let a word reach the ground line and you lose a life.

KEYS     type the words    BACKSPACE / TAB release the locked word    ENTER pause    ESC menu
(needs a physical keyboard)

Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
Browser:  npm run build:py          (see ../README.md)

To add words, extend the WORDS lists below (tiers unlock with the wave number).
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
LIVES = 3
DANGER_Y = 500                 # a word whose card reaches this line costs a life
SHIP = (W // 2, 584)
WORDS_PER_WAVE = 8
BEST_KEY = "infom4th.variable-shooter.best"

# Word tiers: a higher wave unlocks (and mixes in) longer words.
WORDS = [
    ["if", "for", "def", "in", "is", "or", "and", "not", "try", "None", "True", "pass", "else", "del"],
    ["print", "input", "range", "len", "list", "dict", "set", "str", "int", "float", "class", "while", "elif", "break", "open", "type"],
    ["import", "return", "lambda", "append", "sorted", "except", "global", "yield", "assert", "format", "strip", "split", "join", "upper"],
    ["enumerate", "isinstance", "__init__", "print(x)", "len(a)", "def f():", "x += 1", "import os", "for i in a:", "return x", "a[0]", "{'a': 1}"],
]


def tiers_for(wave):
    """Which word lists can appear in this wave."""
    n = 1 + (wave - 1) // 2
    return WORDS[: min(n, len(WORDS))]


class Engine:
    """Rules only. `rng` can be injected for tests."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.state = "menu"                   # menu -> playing <-> paused -> gameover
        self.events = []
        self.reset()

    def reset(self):
        self.enemies = []                     # {"word", "x", "y", "typed"}
        self.locked = None
        self.score = 0
        self.lives = LIVES
        self.wave = 1
        self.destroyed = 0
        self.combo = 0
        self.best_combo = 0
        self.keys = 0                         # key presses that matched / total, for accuracy
        self.hits = 0
        self.spawn_t = 0.8
        self.time = 0.0
        self.wave_banner = 2.0

    # ------------------------------------------------------------ queries
    @property
    def speed(self):
        return min(26 + 4 * self.wave, 85)

    @property
    def spawn_interval(self):
        return max(0.7, 2.6 - 0.16 * self.wave)

    @property
    def accuracy(self):
        return 100.0 if self.keys == 0 else 100.0 * self.hits / self.keys

    # ------------------------------------------------------------ actions
    def new_game(self):
        self.reset()
        self.state = "playing"
        self.events.clear()

    def pause(self):
        if self.state == "playing":
            self.state = "paused"
        elif self.state == "paused":
            self.state = "playing"

    def release(self):
        """Let go of the locked word (its typed progress is lost)."""
        if self.locked is not None:
            self.locked["typed"] = 0
            self.locked = None

    def type_char(self, ch):
        """One typed character. Returns 'lock', 'hit', 'done', 'wrong' or None (ignored)."""
        if self.state != "playing" or not ch or len(ch) != 1 or not ch.isprintable():
            return None
        self.keys += 1
        if self.locked is None:
            candidates = [e for e in self.enemies if e["word"].startswith(ch)]
            if not candidates:
                return self._wrong(ch)
            self.locked = max(candidates, key=lambda e: e["y"])          # the lowest one is the most urgent
        target = self.locked
        expected = target["word"][target["typed"]]
        if ch != expected:
            return self._wrong(ch)
        first = target["typed"] == 0
        target["typed"] += 1
        self.hits += 1
        self.combo += 1
        self.best_combo = max(self.best_combo, self.combo)
        self.score += 10 * (1 + self.combo // 10)
        self.events.append({"type": "shot", "x": target["x"], "y": target["y"]})
        if target["typed"] >= len(target["word"]):
            bonus = 20 * len(target["word"]) * (1 + self.combo // 10)
            self.score += bonus
            self.enemies.remove(target)
            self.locked = None
            self.destroyed += 1
            self.events.append({"type": "boom", "x": target["x"], "y": target["y"], "word": target["word"], "points": bonus})
            if self.destroyed % WORDS_PER_WAVE == 0:
                self.wave += 1
                self.wave_banner = 2.0
                self.events.append({"type": "wave", "wave": self.wave})
            return "done"
        return "lock" if first else "hit"

    def _wrong(self, ch):
        self.combo = 0
        self.events.append({"type": "wrong", "char": ch})
        return "wrong"

    # ------------------------------------------------------------ time
    def update(self, dt):
        dt = min(dt, 0.05)
        if self.state != "playing":
            return
        self.time += dt
        self.wave_banner = max(0.0, self.wave_banner - dt)
        for e in list(self.enemies):
            e["y"] += self.speed * dt
            if e["y"] >= DANGER_Y:
                self.enemies.remove(e)
                if self.locked is e:
                    self.locked = None
                self.lives -= 1
                self.combo = 0
                self.events.append({"type": "land", "x": e["x"], "word": e["word"]})
                if self.lives <= 0:
                    self.state = "gameover"
                    self.events.append({"type": "gameover", "score": self.score, "wave": self.wave})
                    return
        self.spawn_t -= dt
        if self.spawn_t <= 0:
            self.spawn_t = self.spawn_interval
            self.spawn()

    def pick_word(self):
        taken = {e["word"][0] for e in self.enemies}         # avoid two words starting with the same letter on screen
        pool = [w for tier in tiers_for(self.wave) for w in tier]
        for _ in range(20):
            word = self.rng.choice(pool)
            if word[0] not in taken and word[0] != " ":
                return word
        return self.rng.choice(pool)

    def spawn(self):
        word = self.pick_word()
        half = 20 + 8 * len(word)                           # rough half-width of the card
        for _ in range(12):
            x = self.rng.randint(max(90, half), min(W - 90, W - half))
            if all(abs(e["x"] - x) > 130 or e["y"] > 140 for e in self.enemies):
                break
        enemy = {"word": word, "x": x, "y": 70.0, "typed": 0}
        self.enemies.append(enemy)
        return enemy


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Variable Shooter")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()
        self.eng = Engine()
        self.background = ps.grid_surface(W, H)
        self.f_title = ps.title(110)
        self.f_big = ps.title(56)
        self.f_hud = ps.title(40)
        self.f_mid = ps.body(32)
        self.f_small = ps.body(22)
        self.f_word = ps.mono(32, bold=True)
        self.best = int(arcade_web.store_get(BEST_KEY, 0) or 0)
        self.beams = []                     # [x, y, life]
        self.bursts = []                    # [x, y, vx, vy, life]
        self.popups = []                    # [text, x, y, life, color]
        self.shake = 0.0
        self.flash = 0.0
        self.final = None

    # ------------------------------------------------------------ effects
    def handle_events(self):
        for ev in self.eng.events:
            t = ev["type"]
            if t == "shot":
                self.beams.append([ev["x"], ev["y"], 0.12])
            elif t == "boom":
                self.popups.append([f"+{ev['points']}", ev["x"], ev["y"], 1.0, ps.GREEN])
                for _ in range(22):
                    a = random.uniform(0, math.tau)
                    speed = random.uniform(70, 260)
                    self.bursts.append([ev["x"], ev["y"], speed * math.cos(a), speed * math.sin(a), random.uniform(0.3, 0.8)])
            elif t == "wrong":
                self.flash = 0.18
            elif t == "land":
                self.shake = 0.3
                self.popups.append([ev["word"], ev["x"], DANGER_Y - 20, 1.0, ps.RED])
            elif t == "wave":
                self.popups.append([f"WAVE {ev['wave']}", W // 2, 260, 1.5, ps.BLUE])
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
        self.flash = max(0.0, self.flash - dt)
        for b in self.beams:
            b[2] -= dt
        self.beams = [b for b in self.beams if b[2] > 0]
        for p in self.popups:
            p[2] -= 35 * dt
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
        if event.key == pygame.K_ESCAPE:
            self.quit()
        elif e.state in ("menu", "gameover"):
            if event.key in (pygame.K_SPACE, pygame.K_RETURN):
                self.start()
        elif event.key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            e.pause()                          # ENTER pauses (letters and space are needed for the words)
        elif e.state == "paused":
            pass
        elif event.key in (pygame.K_BACKSPACE, pygame.K_TAB):
            e.release()
        elif event.unicode:
            e.type_char(event.unicode)

    def on_pointer(self, pos):
        if self.eng.state in ("menu", "gameover"):
            self.start()
        elif self.eng.state == "paused":
            self.eng.pause()

    def start(self):
        self.eng.new_game()
        self.beams.clear()
        self.bursts.clear()
        self.popups.clear()
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

    def draw_ship(self):
        x, y = SHIP
        pts = [(x, y - 34), (x + 26, y + 18), (x + 8, y + 10), (x - 8, y + 10), (x - 26, y + 18)]
        pygame.draw.polygon(self.screen, ps.INK, [(px + 3, py + 4) for px, py in pts])
        pygame.draw.polygon(self.screen, ps.BLUE, pts)
        pygame.draw.polygon(self.screen, ps.INK, pts, 3)
        pygame.draw.circle(self.screen, ps.HL, (x, y - 6), 6)
        pygame.draw.circle(self.screen, ps.INK, (x, y - 6), 6, 2)

    def draw_enemy(self, en, locked):
        word = en["word"]
        img_w = self.f_word.size(word)[0]
        r = pygame.Rect(0, 0, img_w + 36, 50)
        r.center = (int(en["x"]), int(en["y"]))
        danger = en["y"] > DANGER_Y - 110
        ps.card(self.screen, r, fill=ps.HL if (locked or danger) else ps.CARD, border=ps.RED if danger else (ps.BLUE if locked else ps.INK), seed=len(word) * 7 + int(en["x"]) // 40, width=3 if locked else 2)
        x = r.left + 18
        for i, ch in enumerate(word):
            color = ps.BLUE if i < en["typed"] else ps.INK
            img = self.f_word.render(ch, True, color)
            adv = ps.advance(self.f_word)
            self.screen.blit(img, (x + (adv - img.get_width()) // 2, r.centery - img.get_height() // 2))
            x += adv
        if locked:
            nxt = en["typed"]
            if nxt < len(word):
                adv = ps.advance(self.f_word)
                pygame.draw.line(self.screen, ps.RED, (r.left + 18 + nxt * adv, r.bottom - 8), (r.left + 18 + (nxt + 1) * adv, r.bottom - 8), 3)

    def draw_world(self):
        e = self.eng
        self.screen.blit(self.background, (0, 0))
        # danger line
        for x in range(30, W - 30, 26):
            pygame.draw.line(self.screen, ps.RED, (x, DANGER_Y + 26), (x + 14, DANGER_Y + 26), 3)
        ps.text(self.screen, "keep words above this line", self.f_small, ps.INK_FAINT, (W - 40, DANGER_Y + 46), "midright")
        for en in sorted(e.enemies, key=lambda z: z["y"]):
            self.draw_enemy(en, en is e.locked)
        for x, y, life in self.beams:
            pygame.draw.line(self.screen, ps.RED, (SHIP[0], SHIP[1] - 30), (x, y + 24), 4)
        for x, y, vx, vy, life in self.bursts:
            pygame.draw.circle(self.screen, ps.BLUE, (int(x), int(y)), max(2, int(life * 9)))
        for text, x, y, life, color in self.popups:
            ps.text(self.screen, text, self.f_hud, color, (x, y))
        self.draw_ship()
        # HUD
        ps.text(self.screen, f"Score {e.score}", self.f_hud, ps.INK, (90, 26), "midleft")
        ps.text(self.screen, f"Wave {e.wave}", self.f_hud, ps.BLUE, (W // 2, 26))
        for i in range(e.lives):
            cx = W - 50 - i * 34
            pygame.draw.circle(self.screen, ps.RED, (cx, 26), 12)
            pygame.draw.circle(self.screen, ps.INK, (cx, 26), 12, 2)
        ps.text(self.screen, f"best {self.best}", self.f_small, ps.INK_SOFT, (90, 56), "midleft")
        if e.combo >= 5:
            ps.text(self.screen, f"combo {e.combo}", self.f_small, ps.GREEN, (W - 90, 56), "midright")
        if e.wave_banner > 0 and e.state == "playing":
            ps.text(self.screen, f"Wave {e.wave}: type the words!" if e.wave == 1 else f"Wave {e.wave}", self.f_big, ps.INK_SOFT, (W // 2, 330))
        if self.flash > 0:
            pygame.draw.rect(self.screen, ps.RED, (0, 0, W, H), width=8)

    def draw(self):
        e = self.eng
        if e.state == "menu":
            self.paper_page()
            ps.text(self.screen, "VARIABLE SHOOTER", self.f_title, ps.BLUE, (W // 2, 100))
            ps.text(self.screen, "Type the Python before it lands.", self.f_mid, ps.INK_SOFT, (W // 2, 170))
            for i, tip in enumerate(["Words fall. Type one to lock it, finish it to blast it.",
                                     "A wrong key breaks your combo. BACKSPACE releases a word. ENTER pauses.",
                                     "Don't let a word reach the dotted line.",
                                     "Needs a keyboard."]):
                ps.text(self.screen, tip, self.f_mid, ps.INK, (W // 2, 245 + i * 40))
            btn = pygame.Rect(0, 0, 460, 64)
            btn.center = (W // 2, 460)
            ps.pill(self.screen, btn, ps.BLUE)
            ps.text(self.screen, "Press SPACE to start", self.f_hud, ps.ON_BLUE, btn.center)
            ps.text(self.screen, f"best {self.best}", self.f_mid, ps.INK_SOFT, (W // 2, 540))
        else:
            self.draw_world()
            if e.state == "paused":
                box = pygame.Rect(0, 0, 440, 90)
                box.center = (W // 2, 260)
                ps.card(self.screen, box)
                ps.text(self.screen, "PAUSED  (ENTER to resume)", self.f_hud, ps.INK, box.center)
            elif e.state == "gameover":
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 232))
                self.screen.blit(veil, (0, 0))
                pygame.draw.line(self.screen, ps.RED, (70, 0), (70, H), 2)
                ps.text(self.screen, "GAME OVER", self.f_title, ps.RED, (W // 2, 130))
                ps.text(self.screen, f"Score {self.final}   -   Wave {e.wave}", self.f_big, ps.INK, (W // 2, 240))
                ps.text(self.screen, f"Words {e.destroyed}   Accuracy {e.accuracy:.0f}%   Best combo {e.best_combo}", self.f_mid, ps.INK_SOFT, (W // 2, 310))
                new_best = self.final is not None and self.final >= self.best and self.final > 0
                ps.text(self.screen, "New personal best!" if new_best else f"Best {self.best}", self.f_mid, ps.BLUE, (W // 2, 366))
                ps.text(self.screen, "Your score was sent to the arcade leaderboard.", self.f_small, ps.INK_SOFT, (W // 2, 414))
                ps.text(self.screen, "SPACE: play again     ESC: menu", self.f_mid, ps.BLUE, (W // 2, 520))
        if self.shake > 0:
            self.screen.scroll(random.randint(-5, 5), random.randint(-5, 5))
        pygame.display.flip()

    # ------------------------------------------------------------ main loop
    async def run(self):
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
