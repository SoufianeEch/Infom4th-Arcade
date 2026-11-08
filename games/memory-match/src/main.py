"""
MEMORY MATCH - pair each piece of Python with what it means
-----------------------------------------------------------
Flip two cards: a code card (blue, monospace) and a meaning card. A matching pair stays face up.
Clear the board before the time runs out; every level has more cards and less time.

MOUSE / TOUCH   tap a card to flip it
KEYBOARD        arrows move, SPACE / ENTER flip        ESC menu

Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
Browser:  npm run build:py          (see ../README.md)

To add cards, add a (code, meaning) tuple to PAIRS below. Keep meanings short (about 20 characters).
"""

import asyncio
import random
import sys

import pygame

import arcade_web
import paper_style as ps

W, H = 1000, 640
FPS = 60
MISMATCH_TIME = 0.9
LEVEL_PAIRS = [6, 8, 10, 12]            # pairs per level; after that it stays at 12
BEST_KEY = "infom4th.memory-match.best"
GRID = pygame.Rect(40, 110, 920, 500)
GAP = 16

# (code, what it means / what it gives)
PAIRS = [
    ("len('hi')", "2"), ("print()", "shows text"), ("input()", "reads typed text"), ("def", "defines a function"),
    ("import", "loads a module"), ("# text", "a comment"), ("==", "equal to?"), ("!=", "not equal to?"),
    ("7 // 2", "3"), ("7 % 2", "1"), ("2 ** 3", "8"), ("[]", "an empty list"), ("{}", "an empty dict"),
    ("None", "no value"), ("not True", "False"), ("'ab' * 2", "'abab'"), ("x += 1", "adds 1 to x"),
    ("for", "repeats over items"), ("while", "repeats while true"), ("if", "chooses a path"),
    ("return", "sends a value back"), ("pop()", "removes the last item"), ("sorted()", "makes a sorted copy"),
    ("type(3)", "int"), ("append()", "adds to a list"), ("range(3)", "0 1 2"), ("str(7)", "'7'"),
    ("int('7')", "7"), ("list('ab')", "['a', 'b']"), ("'a' in 'cat'", "True"), ("bool(0)", "zero counts as false"),
    ("round(2.6)", "nearest whole number"), ("abs(-4)", "4"), ("max(2, 9)", "9"), ("'Hi'.lower()", "'hi'"),
]


def pairs_for(level):
    return LEVEL_PAIRS[min(level, len(LEVEL_PAIRS)) - 1]


def time_for(level):
    n = pairs_for(level)
    return max(n * 7, n * 14 - 3 * (level - 1))


def grid_for(pairs):
    """(columns, rows) for the number of pairs."""
    return {6: (4, 3), 8: (4, 4), 10: (5, 4), 12: (6, 4)}[pairs]


class Engine:
    """Rules only. `rng` can be injected for tests."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.state = "menu"                   # menu -> playing -> clear -> (playing | gameover)
        self.events = []
        self.reset()

    def reset(self):
        self.level = 1
        self.score = 0
        self.streak = 0
        self.cards = []
        self.up = []                          # indexes of the face-up, unresolved cards
        self.pending = 0.0                    # > 0 while a mismatch is shown
        self.moves = 0
        self.time_left = 0.0
        self.clear_t = 0.0
        self.matched_pairs = 0

    # ------------------------------------------------------------ setup
    def new_game(self):
        self.reset()
        self.events.clear()
        self.start_level()

    def start_level(self):
        n = pairs_for(self.level)
        chosen = self.rng.sample(range(len(PAIRS)), n)
        cards = []
        for pid in chosen:
            code, meaning = PAIRS[pid]
            cards.append({"pair": pid, "kind": "code", "text": code, "state": "down"})
            cards.append({"pair": pid, "kind": "meaning", "text": meaning, "state": "down"})
        self.rng.shuffle(cards)
        self.cards = cards
        self.up = []
        self.pending = 0.0
        self.moves = 0
        self.streak = 0
        self.matched_pairs = 0
        self.time_left = float(time_for(self.level))
        self.state = "playing"

    # ------------------------------------------------------------ actions
    def flip(self, i):
        """Flip card i. Returns 'ignored', 'up', 'match' or 'mismatch'."""
        if self.state != "playing" or not (0 <= i < len(self.cards)):
            return "ignored"
        if self.pending > 0:                  # tapping during a mismatch hides it right away
            self.resolve_mismatch()
        card = self.cards[i]
        if card["state"] != "down":
            return "ignored"
        card["state"] = "up"
        self.up.append(i)
        if len(self.up) < 2:
            return "up"
        a, b = (self.cards[k] for k in self.up)
        self.moves += 1
        if a["pair"] == b["pair"] and a["kind"] != b["kind"]:
            a["state"] = b["state"] = "matched"
            self.up = []
            self.streak += 1
            self.matched_pairs += 1
            points = 50 + 10 * (self.streak - 1)
            self.score += points
            self.events.append({"type": "match", "cards": [i], "points": points})
            if self.matched_pairs == len(self.cards) // 2:
                par = 3 * (len(self.cards) // 2)
                bonus = int(self.time_left) * 5 + max(0, par - self.moves) * 10
                self.score += bonus
                self.state = "clear"
                self.clear_t = 1.8
                self.events.append({"type": "level_clear", "level": self.level, "bonus": bonus})
            return "match"
        self.streak = 0
        self.pending = MISMATCH_TIME
        self.events.append({"type": "mismatch"})
        return "mismatch"

    def resolve_mismatch(self):
        for k in self.up:
            self.cards[k]["state"] = "down"
        self.up = []
        self.pending = 0.0

    # ------------------------------------------------------------ time
    def update(self, dt):
        dt = min(dt, 0.05)
        if self.state == "clear":
            self.clear_t -= dt
            if self.clear_t <= 0:
                self.level += 1
                self.start_level()
            return
        if self.state != "playing":
            return
        if self.pending > 0:
            self.pending -= dt
            if self.pending <= 0:
                self.resolve_mismatch()
        self.time_left -= dt
        if self.time_left <= 0:
            self.time_left = 0.0
            self.state = "gameover"
            self.events.append({"type": "gameover", "score": self.score, "level": self.level})


def layout(n_cards):
    """Rects for every card, centred in the grid area."""
    cols, rows = grid_for(n_cards // 2)
    w = (GRID.w - GAP * (cols - 1)) // cols
    h = (GRID.h - GAP * (rows - 1)) // rows
    return [pygame.Rect(GRID.x + (i % cols) * (w + GAP), GRID.y + (i // cols) * (h + GAP), w, h) for i in range(n_cards)]


def wrap(text, font, width):
    lines, cur = [], ""
    for word in text.split(" "):
        test = (cur + " " + word).strip()
        if font.size(test)[0] <= width or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = word
    lines.append(cur)
    return lines


class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Memory Match")
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
        self.rects = []
        self.cursor = 0
        self.hover = None
        self.popups = []
        self.final = None
        self.anim = 0.0

    def handle_events(self):
        e = self.eng
        for ev in e.events:
            t = ev["type"]
            if t == "match":
                r = self.rects[ev["cards"][0]] if self.rects else pygame.Rect(W // 2, H // 2, 1, 1)
                self.popups.append([f"+{ev['points']}", r.centerx, r.top, 1.0, ps.GREEN])
            elif t == "level_clear":
                self.popups.append([f"Level {ev['level']} clear!  +{ev['bonus']}", W // 2, 70, 1.8, ps.BLUE])
            elif t == "gameover":
                self.final = ev["score"]
                if ev["score"] > self.best:
                    self.best = ev["score"]
                    arcade_web.store_set(BEST_KEY, self.best)
                arcade_web.report_score(ev["score"])
        e.events.clear()
        if len(self.rects) != len(e.cards):
            self.rects = layout(len(e.cards)) if e.cards else []
            self.cursor = 0

    def update(self, dt):
        self.anim += dt
        self.eng.update(dt)
        self.handle_events()
        for p in self.popups:
            p[2] -= 30 * dt
            p[3] -= dt
        self.popups = [p for p in self.popups if p[3] > 0]

    # ------------------------------------------------------------ input
    def card_at(self, pos):
        for i, r in enumerate(self.rects):
            if r.collidepoint(pos):
                return i
        return None

    def on_pointer(self, pos):
        e = self.eng
        if e.state in ("menu", "gameover"):
            self.start()
            return
        i = self.card_at(pos)
        if i is not None:
            self.cursor = i
            e.flip(i)

    def on_key(self, event):
        e = self.eng
        k = event.key
        if k == pygame.K_ESCAPE:
            self.quit()
        elif e.state in ("menu", "gameover"):
            if k in (pygame.K_SPACE, pygame.K_RETURN):
                self.start()
        elif e.state == "playing" and self.rects:
            cols, _ = grid_for(len(e.cards) // 2)
            n = len(self.rects)
            if k == pygame.K_LEFT:
                self.cursor = (self.cursor - 1) % n
            elif k == pygame.K_RIGHT:
                self.cursor = (self.cursor + 1) % n
            elif k == pygame.K_UP:
                self.cursor = (self.cursor - cols) % n
            elif k == pygame.K_DOWN:
                self.cursor = (self.cursor + cols) % n
            elif k in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER):
                e.flip(self.cursor)

    def start(self):
        self.eng.new_game()
        self.popups.clear()
        self.final = None
        self.rects = []
        self.handle_events()

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

    def draw_card(self, i, card, r):
        hot = i == self.hover
        s = self.screen
        if card["state"] == "down":
            ps.card(s, r, fill=ps.CARD, border=ps.BLUE if hot else ps.INK, seed=i * 11 + 1)
            clip = s.get_clip()
            s.set_clip(r.inflate(-8, -8))
            for off in range(-r.h, r.w, 18):                         # pencil hatching on the back of the card
                pygame.draw.line(s, ps.GRID if not ps.DARK else ps.INK_FAINT, (r.left + off, r.bottom), (r.left + off + r.h, r.top), 2)
            s.set_clip(clip)
            ps.text(s, "?", ps.title(54), ps.INK_SOFT, r.center)
            return
        matched = card["state"] == "matched"
        is_code = card["kind"] == "code"
        border = ps.GREEN if matched else (ps.BLUE if is_code else ps.INK)
        ps.card(s, r, fill=ps.HL if matched else ps.CARD, border=border, seed=i * 11 + 2, width=3 if matched else 2)
        color = ps.INK_SOFT if matched else (ps.BLUE if is_code else ps.INK)
        fonts = [ps.mono(s_, bold=True) for s_ in (30, 26, 22, 18, 16)] if is_code else [ps.body(s_) for s_ in (28, 25, 22, 19)]
        inner = r.w - 20
        font = fonts[-1]
        lines = [card["text"]]
        for f in fonts:
            lines = wrap(card["text"], f, inner)
            if all(f.size(line)[0] <= inner for line in lines) and len(lines) * f.get_height() <= r.h - 16:
                font = f
                break
        total = len(lines) * font.get_linesize()
        y = r.centery - total // 2 + font.get_linesize() // 2
        for line in lines:
            ps.text(s, line, font, color, (r.centerx, y))
            y += font.get_linesize()
        if is_code:
            ps.text(s, "code", ps.body(16), ps.INK_FAINT, (r.left + 24, r.top + 14))

    def draw_hud(self):
        e = self.eng
        ps.text(self.screen, f"Score {e.score}", self.f_hud, ps.INK, (90, 28), "midleft")
        ps.text(self.screen, f"Level {e.level}", self.f_hud, ps.BLUE, (W // 2, 28))
        ps.text(self.screen, f"moves {e.moves}", self.f_small, ps.INK_SOFT, (W - 90, 20), "midright")
        ps.text(self.screen, f"best {self.best}", self.f_small, ps.INK_SOFT, (W - 90, 46), "midright")
        total = max(1.0, float(time_for(e.level)))
        ratio = max(0.0, e.time_left / total)
        bar = pygame.Rect(90, 66, W - 180, 18)
        pygame.draw.rect(self.screen, ps.CARD, bar, border_radius=9)
        if ratio > 0:
            pygame.draw.rect(self.screen, ps.BLUE if ratio > 0.25 else ps.RED, (bar.x, bar.y, max(18, int(bar.w * ratio)), bar.h), border_radius=9)
        pygame.draw.rect(self.screen, ps.INK, bar, width=2, border_radius=9)
        ps.text(self.screen, f"{int(e.time_left)}s", self.f_small, ps.INK_SOFT, (bar.right + 38, bar.centery))

    def draw(self):
        e = self.eng
        if e.state == "menu":
            self.paper_page()
            ps.text(self.screen, "MEMORY MATCH", self.f_title, ps.BLUE, (W // 2, 100))
            ps.text(self.screen, "Pair the code with what it means.", self.f_mid, ps.INK_SOFT, (W // 2, 170))
            for i, tip in enumerate(["Flip two cards: a blue code card and a meaning card.",
                                     "Match them all before the timer runs out.",
                                     "Each level has more cards and less time.",
                                     "Tap or click the cards (arrows + SPACE also work)."]):
                ps.text(self.screen, tip, self.f_mid, ps.INK, (W // 2, 245 + i * 40))
            btn = pygame.Rect(0, 0, 460, 64)
            btn.center = (W // 2, 460)
            ps.pill(self.screen, btn, ps.BLUE)
            ps.text(self.screen, "Press SPACE or tap to start", self.f_hud, ps.ON_BLUE, btn.center)
            ps.text(self.screen, f"best {self.best}", self.f_mid, ps.INK_SOFT, (W // 2, 540))
        else:
            self.screen.blit(self.background, (0, 0))
            self.draw_hud()
            for i, (card, r) in enumerate(zip(e.cards, self.rects)):
                self.draw_card(i, card, r)
            if e.state == "playing" and self.rects and self.hover is None:
                ps.sketch_rect(self.screen, self.rects[self.cursor].inflate(8, 8), ps.RED, width=2, seed=5)
            for text, x, y, life, color in self.popups:
                ps.text(self.screen, text, self.f_hud, color, (x, y))
            if e.state == "gameover":
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 232))
                self.screen.blit(veil, (0, 0))
                pygame.draw.line(self.screen, ps.RED, (70, 0), (70, H), 2)
                ps.text(self.screen, "TIME'S UP", self.f_title, ps.RED, (W // 2, 140))
                ps.text(self.screen, f"Score {self.final}   -   Level {e.level}", self.f_big, ps.INK, (W // 2, 250))
                new_best = self.final is not None and self.final >= self.best and self.final > 0
                ps.text(self.screen, "New personal best!" if new_best else f"Best {self.best}", self.f_mid, ps.BLUE, (W // 2, 320))
                ps.text(self.screen, "Your score was sent to the arcade leaderboard.", self.f_small, ps.INK_SOFT, (W // 2, 372))
                ps.text(self.screen, "SPACE / tap: play again     ESC: menu", self.f_mid, ps.BLUE, (W // 2, 520))
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
                    self.hover = None
                elif event.type == pygame.MOUSEMOTION:
                    self.hover = self.card_at(event.pos)
                elif event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.on_pointer(event.pos)
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)


async def main():
    await Game().run()


if __name__ == "__main__":
    asyncio.run(main())
