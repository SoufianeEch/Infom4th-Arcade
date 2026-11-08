"""Python Type Race — minimalist typing test.

Run:
    python main.py            (desktop)
    npm run build:py          (browser build, see ../README.md)

One snippet, one clock. Start typing to begin.
"""

from __future__ import annotations

import asyncio
import json
import random
from pathlib import Path

import pygame

import arcade_web   # no-ops on the desktop; talks to the arcade hub in the browser
import paper_style as ps   # Notebook Paper look shared by the arcade games

BEST_KEY = "infom4th.type-race.best"

# ---------------------------------------------------------------- settings
W, H = 1000, 640
FPS = 60
BASE = Path(__file__).resolve().parent
BEST_FILE = BASE / "best.json"

# Notebook Paper colours (light/dark by system, see paper_style.py)
BG, PANEL = ps.PAPER, ps.CARD
INK, MUTED, LINE = ps.INK, ps.INK_SOFT, ps.INK
SOFT, TYPED = ps.HL, ps.INK_FAINT
ACCENT, ACCENT_SOFT = ps.BLUE, ps.HL
RED, GREEN = ps.RED, ps.GREEN

SNIPPETS = [
    ('print("Hello, world!")', "print & strings"),
    ('name = "Ada"\nprint(name)', "variables"),
    ("x = 10\nprint(x * 2)", "numbers"),
    ('colors = ["red", "blue"]\nprint(len(colors))', "lists & len"),
    ('word = "python"\nprint(word.upper())', "string methods"),
    ("for i in range(3):\n    print(i)", "for loops"),
    ('if 7 > 3:\n    print("yes")', "conditionals"),
    ("numbers = [1, 2, 3]\nprint(sum(numbers))", "lists & sum"),
    ("def double(n):\n    return n * 2", "functions"),
    ("x = 3\nwhile x > 0:\n    x -= 1", "while loops"),
    ('scores = {"Ada": 10}\nprint(scores["Ada"])', "dictionaries"),
    ("squares = [n * n for n in range(4)]\nprint(squares)", "comprehensions"),
    ("a, b = 2, 3\nprint(a + b)", "tuples"),
    ('name = "Ada"\nprint(f"Hi, {name}!")', "f-strings"),
    ("print(2 ** 8)", "powers"),
    ('print("a,b,c".split(","))', "split"),
    ("is_ready = True\nprint(is_ready)", "booleans"),
]

# Bundled DotGothic16 (SIL OFL, see fonts/DotGothic16-OFL.txt): one weight, used for code and UI.
FONT_FILES = {w: "DotGothic16-Latin.ttf" for w in ("regular", "medium", "bold")}
UI_FONT_FILES = FONT_FILES
FONT_DIRS = [BASE / "fonts"]


# ------------------------------------------------------------------ data
def load_best():
    try:
        if arcade_web.WEB:
            data = arcade_web.store_get(BEST_KEY)
        else:
            data = json.loads(BEST_FILE.read_text())
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    if not isinstance(data.get("score"), (int, float)):
        return None
    return data


def save_best(record):
    if arcade_web.WEB:
        arcade_web.store_set(BEST_KEY, record)
        return
    try:
        BEST_FILE.write_text(json.dumps(record, indent=2))
    except OSError:
        pass


def clock_string(seconds):
    seconds = max(0.0, seconds)
    return f"{int(seconds // 60)}:{seconds % 60:04.1f}"


class Session:
    """Character-by-character typing state for one snippet."""

    def __init__(self, code, concept):
        self.code = code
        self.concept = concept
        self.i = 0
        self.correct = 0
        self.errors = 0
        self.elapsed = 0.0
        self.started = False
        self.done = False
        self.finish_time = None
        self.error_flash = 0.0

    @property
    def progress(self):
        return self.i / max(1, len(self.code))

    @property
    def wpm(self):
        if self.elapsed <= 0.05:
            return 0.0
        return self.correct * 12.0 / self.elapsed

    @property
    def accuracy(self):
        attempts = self.correct + self.errors
        return 100.0 if attempts == 0 else 100.0 * self.correct / attempts

    def press(self, key, typed):
        if self.done:
            return "ignored"

        expected = self.code[self.i]
        if key in (pygame.K_RETURN, pygame.K_KP_ENTER):
            char = "\n"
        elif typed and len(typed) == 1 and typed.isprintable():
            char = typed
        else:
            return "ignored"

        if char != expected:
            self.errors += 1
            self.error_flash = 0.18
            return "wrong"

        self.correct += 1
        self.i += 1

        # Indentation after ENTER is filled in automatically.
        if self.i < len(self.code) and self.code[self.i - 1] == "\n":
            while self.i < len(self.code) and self.code[self.i] == " ":
                self.i += 1

        if self.i >= len(self.code):
            self.done = True
            self.finish_time = self.elapsed
            return "done"
        return "ok"

    def update(self, dt):
        self.error_flash = max(0.0, self.error_flash - dt)
        if self.started and not self.done:
            self.elapsed += dt


# ------------------------------------------------------------------- app
class App:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Python Type Race")
        self.screen = pygame.display.set_mode((W, H))
        self.clock = pygame.time.Clock()

        self.background = ps.grid_surface(W, H)

        self.best = load_best()
        self.last_index = -1
        self.session = None
        self.result = None
        self.state = "typing"
        self.running = True
        self.anim = 0.0
        self.new_snippet()

    # -------------------------------------------------------------- fonts
    def font(self, size, weight="regular", mono=False):
        """Notebook Paper fonts: Courier Prime for code, Gaegu for headings (bold), Patrick Hand for text."""
        if mono:
            return ps.mono(size, bold=weight == "bold")
        return ps.title(round(size * 1.15)) if weight in ("bold", "medium") else ps.body(round(size * 1.2))

    def text(
        self,
        surf,
        value,
        size,
        color,
        pos,
        anchor="topleft",
        weight="regular",
        mono=False,
    ):
        img = self.font(size, weight, mono).render(str(value), True, color)
        rect = img.get_rect(**{anchor: (int(pos[0]), int(pos[1]))})
        surf.blit(img, rect)
        return rect

    # ------------------------------------------------------------- runs
    def new_snippet(self):
        index = random.randrange(len(SNIPPETS))
        while len(SNIPPETS) > 1 and index == self.last_index:
            index = random.randrange(len(SNIPPETS))
        self.last_index = index
        code, concept = SNIPPETS[index]
        self.session = Session(code, concept)
        self.result = None
        self.state = "typing"

    def retry_same(self):
        code, concept = SNIPPETS[self.last_index]
        self.session = Session(code, concept)
        self.result = None
        self.state = "typing"

    def finish(self):
        s = self.session
        elapsed = max(s.elapsed, 0.01)
        wpm = s.correct * 12.0 / elapsed
        accuracy = s.accuracy
        score = int(round(wpm * (accuracy / 100.0) ** 2 * 10.0))

        previous = self.best
        new_score = (score, wpm, accuracy)
        old_score = (
            (previous["score"], previous.get("wpm", 0), previous.get("accuracy", 0))
            if previous
            else None
        )
        is_best = old_score is None or new_score > old_score

        record = {
            "score": score,
            "wpm": round(wpm, 1),
            "accuracy": round(accuracy, 1),
            "time": round(elapsed, 2),
            "snippet": s.concept,
        }
        if is_best:
            self.best = record
            save_best(record)

        self.result = {
            "time": elapsed,
            "wpm": wpm,
            "accuracy": accuracy,
            "errors": s.errors,
            "score": score,
            "is_best": is_best,
            "concept": s.concept,
        }
        self.state = "results"
        arcade_web.report_score(score)        # -> shared leaderboard (browser only)

    def quit(self):
        if arcade_web.WEB:               # a browser tab cannot exit: go back to the arcade menu
            arcade_web.exit_to_arcade()
        else:
            self.running = False

    # ------------------------------------------------------------ input
    def handle_key(self, event):
        if event.key == pygame.K_ESCAPE:
            self.quit()
            return

        if self.state == "results":
            if event.key in (pygame.K_RETURN, pygame.K_KP_ENTER, pygame.K_SPACE):
                self.new_snippet()
            elif event.key == pygame.K_r:
                self.retry_same()
            return

        s = self.session
        if s is None or s.done:
            return

        is_typing = event.key in (pygame.K_RETURN, pygame.K_KP_ENTER) or (
            event.unicode and len(event.unicode) == 1 and event.unicode.isprintable()
        )
        if not is_typing:
            return
        if event.mod & (pygame.KMOD_CTRL | pygame.KMOD_ALT | pygame.KMOD_GUI):
            return

        if not s.started:
            s.started = True

        result = s.press(event.key, event.unicode or None)
        if result == "done":
            self.finish()

    # ------------------------------------------------------------ update
    def update(self, dt):
        self.anim += dt
        if self.state == "typing" and self.session is not None:
            self.session.update(dt)

    # -------------------------------------------------------------- draw
    def draw(self):
        surf = self.screen
        surf.blit(self.background, (0, 0))

        self.draw_header(surf)
        if self.state == "typing":
            self.draw_typing(surf)
        else:
            self.draw_results(surf)

        pygame.display.flip()

    def draw_header(self, surf):
        self.text(surf, "PYTHON TYPE RACE", 40, ps.BLUE, (50, 14), weight="bold")
        self.text(surf, "type it fast. type it right.", 16, MUTED, (52, 62))

        self.text(surf, "PERSONAL BEST", 14, MUTED, (W - 50, 18), "topright")
        best_score = self.best["score"] if self.best else "--"
        self.text(surf, best_score, 34, INK, (W - 50, 36), "topright", weight="bold")

        pygame.draw.line(surf, ps.RED, (50, 94), (W - 50, 94), 2)

    def draw_typing(self, surf):
        s = self.session

        self.text(surf, f"SNIPPET  /  {s.concept.upper()}", 14, MUTED, (52, 108))
        status = "START TYPING" if not s.started else f"{int(s.progress * 100)}%"
        self.text(surf, status, 15, ACCENT, (W - 50, 106), "topright", weight="bold")

        panel = pygame.Rect(50, 142, 900, 290)
        border = RED if s.error_flash > 0 else INK
        ps.card(surf, panel, border=border, seed=17, width=3)
        pygame.draw.line(surf, ps.RED, (panel.left + 56, panel.top + 8), (panel.left + 56, panel.bottom - 8), 2)   # margin line

        self.draw_code(surf, panel, s)

        # progress bar along the bottom edge of the panel
        if s.progress > 0:
            pygame.draw.rect(surf, ACCENT, (panel.left + 16, panel.bottom - 14, int((panel.width - 32) * s.progress), 4), border_radius=2)

        self.draw_stats(surf, s)
        self.draw_footer(surf)

    def draw_code(self, surf, panel, session):
        """Code area. Every character sits in a fixed-width cell of a true monospace font and is centred in it,
        so the highlight and the caret always line up with the glyph they belong to."""
        lines = session.code.split("\n")
        code_font = ps.mono(34)
        small = self.font(14)
        adv = ps.advance(code_font)
        glyph_h = code_font.get_height()
        line_h = 58

        area_top = panel.top + 16
        area_bottom = panel.bottom - 16
        block_h = len(lines) * line_h
        start_y = area_top + max(0, (area_bottom - area_top - block_h) // 2)
        left = panel.left + 84                      # first text column (right of the margin line)

        index = 0
        for row, line in enumerate(lines):
            row_top = start_y + row * line_h
            ty = row_top + (line_h - glyph_h) // 2     # top of every glyph on this row
            num = small.render(str(row + 1), True, ps.INK_FAINT)
            surf.blit(num, num.get_rect(midright=(panel.left + 44, row_top + line_h // 2)))
            x = left

            for col, ch in enumerate(line):
                pos = index + col
                current = pos == session.i
                typed = pos < session.i
                if current:
                    pygame.draw.rect(surf, ACCENT_SOFT, (x, ty + 2, adv, glyph_h - 4), border_radius=5)
                if ch != " ":
                    img = code_font.render(ch, True, TYPED if typed else INK)
                    surf.blit(img, (x + (adv - img.get_width()) // 2, ty))
                elif current:
                    pygame.draw.circle(surf, ACCENT, (x + adv // 2, ty + glyph_h // 2 + 4), 3)
                x += adv

            if session.i == index + len(line) and row < len(lines) - 1:
                hint_w = self.font(13, "medium").size("ENTER")[0] + 20
                hint = pygame.Rect(x + 6, row_top + line_h // 2 - 15, hint_w, 30)
                ps.pill(surf, hint, ACCENT_SOFT, shadow=False, radius=8)
                self.text(surf, "ENTER", 13, INK, hint.center, "center", weight="medium")

            index += len(line) + 1

        # caret: a blinking bar on the left edge of the current cell, exactly as tall as the glyph
        if not session.done:
            before = session.code[: session.i]
            row = before.count("\n")
            col = session.i - (before.rfind("\n") + 1)
            cx = left + col * adv
            cy = start_y + row * line_h + (line_h - glyph_h) // 2
            visible = not session.started or (self.anim * 1.8) % 1 < 0.6
            if session.started and session.elapsed < 0.8:
                visible = True
            if visible and session.code[session.i] != "\n":
                pygame.draw.rect(surf, ps.RED, (cx - 2, cy + 3, 3, glyph_h - 6), border_radius=1)

    def draw_stats(self, surf, session):
        pygame.draw.line(surf, ps.INK_FAINT, (50, 462), (W - 50, 462), 1)
        accuracy = session.accuracy
        values = [
            ("TIME", clock_string(session.elapsed), INK),
            ("WPM", f"{session.wpm:.1f}", INK),
            ("ACCURACY", f"{accuracy:.1f}%", INK),
            ("ERRORS", str(session.errors), RED if session.errors else INK),
        ]
        for i, (label, value, color) in enumerate(values):
            x = 52 + i * 225
            self.text(surf, label, 14, MUTED, (x, 472))
            self.text(surf, value, 42, color, (x, 494), weight="bold")

    def draw_footer(self, surf):
        pygame.draw.line(surf, ps.INK_FAINT, (50, 574), (W - 50, 574), 1)
        self.text(surf, "ENTER for a new line  ·  indentation is automatic  ·  mistakes cost accuracy", 15, MUTED, (52, 590))
        self.text(surf, "ESC  quit", 15, MUTED, (W - 50, 590), "topright")

    # ----------------------------------------------------------- results
    def draw_results(self, surf):
        r = self.result
        if r is None:
            return

        self.text(surf, f"SNIPPET  /  {r['concept'].upper()}", 14, MUTED, (52, 108))
        self.text(surf, "COMPLETE", 15, GREEN, (W - 50, 106), "topright", weight="bold")

        card = pygame.Rect(170, 140, 660, 380)
        ps.card(surf, card, seed=23, width=3)
        pygame.draw.line(surf, ps.RED, (card.left + 14, card.top + 14), (card.right - 14, card.top + 14), 2)

        self.text(surf, "SNIPPET COMPLETE", 15, MUTED, (card.centerx, card.top + 40), "center")
        time_text = f"{r['time']:.2f}s" if r["time"] < 60 else clock_string(r["time"])
        self.text(surf, time_text, 76, ps.BLUE, (card.centerx, card.top + 100), "center", weight="bold")
        self.text(surf, "TIME", 14, MUTED, (card.centerx, card.top + 156), "center")

        pygame.draw.line(surf, ps.INK_FAINT, (card.left + 40, card.top + 186), (card.right - 40, card.top + 186), 1)

        stats = [("WPM", f"{r['wpm']:.1f}"), ("ACCURACY", f"{r['accuracy']:.1f}%"), ("ERRORS", str(r["errors"])), ("SCORE", str(r["score"]))]
        col_w = (card.width - 80) // 4
        for i, (label, value) in enumerate(stats):
            x = card.left + 40 + i * col_w + col_w // 2
            self.text(surf, value, 38, INK, (x, card.top + 214), "center", weight="bold")
            self.text(surf, label, 14, MUTED, (x, card.top + 254), "center")

        pygame.draw.line(surf, ps.INK_FAINT, (card.left + 40, card.top + 280), (card.right - 40, card.top + 280), 1)

        if r["is_best"]:
            self.text(surf, "NEW PERSONAL BEST", 17, ps.RED, (card.centerx, card.top + 302), "center", weight="bold")
        elif self.best:
            self.text(surf, f"BEST  {self.best['score']} PTS   ·   {self.best.get('wpm', 0):.1f} WPM", 15, MUTED, (card.centerx, card.top + 302), "center")

        hints = [("ENTER", "next snippet"), ("R", "same snippet"), ("ESC", "quit")]
        key_font, desc_font = self.font(14, "medium"), self.font(15)
        widths = [max(58, key_font.size(k)[0] + 22) for k, _ in hints]
        descs = [desc_font.size(d)[0] for _, d in hints]
        total = sum(w + 10 + d for w, d in zip(widths, descs)) + 2 * 28
        x = card.centerx - total // 2
        y = card.bottom - 52
        for (key, desc), w, d in zip(hints, widths, descs):
            box = pygame.Rect(x, y, w, 34)
            ps.pill(surf, box, ps.CARD, radius=8)
            self.text(surf, key, 14, INK, box.center, "center", weight="medium")
            self.text(surf, desc, 15, MUTED, (x + w + 12, y + 3))
            x += w + 10 + d + 28

    # --------------------------------------------------------------- run
    async def run(self):
        # async + `await asyncio.sleep(0)` hands control back to the browser every frame;
        # on the desktop it behaves like the original blocking loop.
        while self.running:
            dt = min(0.05, self.clock.tick(FPS) / 1000.0)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                elif event.type == pygame.KEYDOWN:
                    self.handle_key(event)
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)
        pygame.quit()


async def main():
    await App().run()


if __name__ == "__main__":
    asyncio.run(main())
