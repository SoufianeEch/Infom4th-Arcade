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

BEST_KEY = "infom4th.type-race.best"

# ---------------------------------------------------------------- settings
W, H = 1000, 640
FPS = 60
BASE = Path(__file__).resolve().parent
BEST_FILE = BASE / "best.json"
SETTINGS_FILE = BASE / "settings.json"
DEFAULT_SETTINGS = {
    # A font file path (relative to this folder) or an installed font name.
    "ui_font": "DotGothic16",
    "code_font": "DotGothic16",
}

# Blue/white arcade palette. Dark or light follows the system setting (arcade_web.prefers_dark()).
if arcade_web.prefers_dark():
    BG = (7, 16, 48)
    PANEL = (14, 26, 74)
    INK = (244, 248, 255)
    MUTED = (164, 184, 242)
    LINE = (43, 73, 184)
    SOFT = (21, 38, 107)
    TYPED = (92, 112, 176)
    ACCENT = (127, 166, 255)
    ACCENT_SOFT = (30, 52, 140)
    RED = (255, 92, 138)
    GREEN = (61, 220, 151)
    EDGE = (4, 10, 34)              # hard 3D shadow under cards and keys
else:
    BG = (232, 239, 255)
    PANEL = (255, 255, 255)
    INK = (10, 26, 82)
    MUTED = (63, 84, 152)
    LINE = (124, 156, 234)
    SOFT = (220, 231, 255)
    TYPED = (150, 170, 220)
    ACCENT = (31, 92, 255)
    ACCENT_SOFT = (206, 222, 255)
    RED = (214, 52, 96)
    GREEN = (18, 150, 100)
    EDGE = (138, 165, 236)

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


# ------------------------------------------------------------------ fonts
def load_settings():
    """settings.json holds the two font choices. Create it if missing."""
    data = {}
    if SETTINGS_FILE.exists():
        try:
            loaded = json.loads(SETTINGS_FILE.read_text())
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            print(f"[fonts] Could not read {SETTINGS_FILE.name}; using defaults.")
    else:
        data = dict(DEFAULT_SETTINGS)
        try:
            SETTINGS_FILE.write_text(json.dumps(data, indent=2))
        except OSError:
            pass
    for key, value in DEFAULT_SETTINGS.items():
        data.setdefault(key, value)
    return data


def find_source_code_pro(weight, files=None):
    """Find a bundled font file for a weight (name kept for compatibility; now serves DotGothic16)."""
    files = files or FONT_FILES
    filename = files.get(weight, files["regular"])
    for folder in FONT_DIRS:
        candidate = folder / filename
        if candidate.exists():
            return str(candidate)
    return None


class FontBook:
    """Resolve the UI font and the code font from settings.json.

    Each setting can be:
      - a path relative to this folder, e.g. "fonts/GeistPixel-Grid.ttf"
      - an absolute path
      - an installed font name, e.g. "DotGothic16"
    """

    def __init__(self, settings):
        self.ui_value = str(settings.get("ui_font") or DEFAULT_SETTINGS["ui_font"])
        self.code_value = str(settings.get("code_font") or DEFAULT_SETTINGS["code_font"])
        self.cache = {}
        self.warned = set()

    @staticmethod
    def _existing_path(value):
        path = Path(value).expanduser()
        if not path.is_absolute():
            path = BASE / path
        return path if path.exists() else None

    def resolve(self, value, weight):
        found = self._existing_path(value)
        if found:
            return str(found)

        normalized = value.strip().lower().replace(" ", "").replace("-", "")
        if normalized in ("dotgothic16", "dotgothic", "geistmono", "sourcecodepro", "sourcecode"):
            found = find_source_code_pro(weight)
            if found:
                return found

        bold = weight == "bold"
        for name in (value, value.replace(" ", "")):
            found = pygame.font.match_font(name, bold=bold)
            if found:
                return found
        if bold:
            found = pygame.font.match_font(value)
            if found:
                return found
        return None

    def get(self, size, weight="regular", mono=False):
        key = (mono, size, weight)
        if key in self.cache:
            return self.cache[key]

        value = self.code_value if mono else self.ui_value
        path = self.resolve(value, weight)
        if path:
            if "dotgothic" in Path(path).name.lower():
                size = max(16, round(size / 8) * 8)      # pixel font: multiples of 8 stay crisp
            font = pygame.font.Font(path, size)
        else:
            fallback = "dejavusansmono,monospace" if mono else "dejavusans,arial,helvetica"
            font = pygame.font.SysFont(fallback, size, bold=(weight == "bold"))
            if value not in self.warned:
                print(f"[fonts] Could not find {value!r}; using a system fallback.")
                self.warned.add(value)

        self.cache[key] = font
        return font


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

        self.settings = load_settings()
        self.fonts = FontBook(self.settings)

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
        return self.fonts.get(size, weight, mono)

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
        surf.fill(BG)

        self.draw_header(surf)
        if self.state == "typing":
            self.draw_typing(surf)
        else:
            self.draw_results(surf)

        pygame.display.flip()

    def draw_header(self, surf):
        self.text(surf, "PYTHON TYPE RACE", 26, INK, (50, 24), weight="bold")
        self.text(surf, "type it fast. type it right.", 15, MUTED, (50, 56))

        self.text(surf, "PERSONAL BEST", 13, MUTED, (W - 50, 25), "topright")
        best_score = self.best["score"] if self.best else "--"
        self.text(surf, best_score, 28, INK, (W - 50, 44), "topright", weight="bold")

        pygame.draw.line(surf, LINE, (50, 86), (W - 50, 86), 1)

    def draw_typing(self, surf):
        s = self.session

        self.text(
            surf,
            f"SNIPPET   /   {s.concept.upper()}",
            13,
            MUTED,
            (50, 108),
        )
        if not s.started:
            status = "START TYPING"
            color = ACCENT
        else:
            status = f"{int(s.progress * 100)}%"
            color = ACCENT
        self.text(surf, status, 13, color, (W - 50, 108), "topright", weight="bold")

        panel = pygame.Rect(50, 132, 900, 300)
        border = RED if s.error_flash > 0 else LINE
        pygame.draw.rect(surf, EDGE, panel.move(0, 8), border_radius=14)           # hard 3D shadow
        pygame.draw.rect(surf, PANEL, panel, border_radius=14)
        pygame.draw.rect(surf, border, panel, width=3, border_radius=14)

        self.draw_code(surf, panel, s)

        # progress bar along the bottom edge of the panel
        if s.progress > 0:
            pygame.draw.rect(
                surf,
                ACCENT,
                (panel.left + 1, panel.bottom - 3, int((panel.width - 2) * s.progress), 2),
            )

        self.draw_stats(surf, s)
        self.draw_footer(surf)

    def draw_code(self, surf, panel, session):
        lines = session.code.split("\n")
        code_font = self.font(30, mono=True)
        small = self.font(13, mono=True)
        advance = code_font.size("M")[0]
        line_h = 48

        area_top = panel.top + 26
        area_bottom = panel.bottom - 26
        block_h = len(lines) * line_h
        start_y = area_top + max(0, (area_bottom - area_top - block_h) // 2)

        index = 0
        for row, line in enumerate(lines):
            y = start_y + row * line_h
            line_no = small.render(str(row + 1), True, MUTED)
            surf.blit(line_no, (panel.left + 28, y + 10))
            x = panel.left + 64

            for col, ch in enumerate(line):
                pos = index + col
                current = pos == session.i
                typed = pos < session.i

                if current:
                    pygame.draw.rect(
                        surf,
                        ACCENT_SOFT,
                        (x - 3, y - 1, advance + 6, line_h - 12),
                        border_radius=4,
                    )
                if ch != " ":
                    color = TYPED if typed else INK
                    surf.blit(code_font.render(ch, True, color), (x, y))
                elif current:
                    pygame.draw.circle(
                        surf,
                        ACCENT,
                        (x + advance // 2, y + line_h // 2 - 2),
                        2,
                    )
                x += advance

            if session.i == index + len(line) and row < len(lines) - 1:
                hint_w = self.font(12, "medium").size("ENTER")[0] + 16
                hint = pygame.Rect(x + 5, y + 7, hint_w, 26)
                pygame.draw.rect(surf, ACCENT_SOFT, hint, border_radius=4)
                self.text(surf, "ENTER", 12, ACCENT, hint.center, "center", weight="medium")

            index += len(line) + 1

        # caret
        if not session.done:
            before = session.code[: session.i]
            row = before.count("\n")
            col = session.i - (before.rfind("\n") + 1)
            caret_x = panel.left + 64 + col * advance
            caret_y = start_y + row * line_h
            visible = not session.started or (self.anim * 1.8) % 1 < 0.6
            if session.started and session.elapsed < 0.8:
                visible = True
            if visible and session.code[session.i] != "\n":
                pygame.draw.line(
                    surf,
                    ACCENT,
                    (caret_x - 3, caret_y + 4),
                    (caret_x - 3, caret_y + line_h - 15),
                    2,
                )

    def draw_stats(self, surf, session):
        pygame.draw.line(surf, LINE, (50, 462), (W - 50, 462), 1)

        accuracy = session.accuracy
        values = [
            ("TIME", clock_string(session.elapsed), INK),
            ("WPM", f"{session.wpm:.1f}", INK),
            ("ACCURACY", f"{accuracy:.1f}%", INK),
            ("ERRORS", str(session.errors), RED if session.errors else INK),
        ]
        for i, (label, value, color) in enumerate(values):
            x = 50 + i * 225
            self.text(surf, label, 13, MUTED, (x, 480))
            self.text(surf, value, 34, color, (x, 500), weight="bold")

    def draw_footer(self, surf):
        pygame.draw.line(surf, LINE, (50, 574), (W - 50, 574), 1)
        self.text(
            surf,
            "ENTER for a new line  ·  indentation is automatic  ·  mistakes cost accuracy",
            15,
            MUTED,
            (50, 594),
        )
        self.text(surf, "ESC  quit", 15, MUTED, (W - 50, 594), "topright")

    # ----------------------------------------------------------- results
    def draw_results(self, surf):
        r = self.result
        if r is None:
            return

        self.text(
            surf,
            f"SNIPPET   /   {r['concept'].upper()}",
            13,
            MUTED,
            (50, 108),
        )
        self.text(surf, "COMPLETE", 13, GREEN, (W - 50, 108), "topright", weight="bold")

        card = pygame.Rect(170, 148, 660, 358)
        pygame.draw.rect(surf, PANEL, card)
        pygame.draw.rect(surf, LINE, card, width=1)

        self.text(surf, "SNIPPET COMPLETE", 13, MUTED, (card.centerx, card.top + 30), "center")

        time_text = f"{r['time']:.2f}s" if r["time"] < 60 else clock_string(r["time"])
        self.text(
            surf,
            time_text,
            60,
            INK,
            (card.centerx, card.top + 90),
            "center",
            weight="bold",
        )
        self.text(surf, "TIME", 13, MUTED, (card.centerx, card.top + 146), "center")

        pygame.draw.line(surf, LINE, (card.left + 40, card.top + 178), (card.right - 40, card.top + 178), 1)

        stats = [
            ("WPM", f"{r['wpm']:.1f}"),
            ("ACCURACY", f"{r['accuracy']:.1f}%"),
            ("ERRORS", str(r["errors"])),
            ("SCORE", str(r["score"])),
        ]
        col_w = (card.width - 80) // 4
        for i, (label, value) in enumerate(stats):
            x = card.left + 40 + i * col_w + col_w // 2
            self.text(surf, value, 30, INK, (x, card.top + 204), "center", weight="bold")
            self.text(surf, label, 13, MUTED, (x, card.top + 240), "center")

        pygame.draw.line(surf, LINE, (card.left + 40, card.top + 268), (card.right - 40, card.top + 268), 1)

        if r["is_best"]:
            self.text(
                surf,
                "NEW PERSONAL BEST",
                14,
                ACCENT,
                (card.centerx, card.top + 288),
                "center",
                weight="bold",
            )
        elif self.best:
            self.text(
                surf,
                f"BEST  {self.best['score']} PTS   ·   {self.best.get('wpm', 0):.1f} WPM",
                14,
                MUTED,
                (card.centerx, card.top + 288),
                "center",
            )

        hints = [
            ("ENTER", "next snippet"),
            ("R", "same snippet"),
            ("ESC", "quit"),
        ]
        widths = [max(48, self.font(13).size(k)[0] + 18) for k, _ in hints]
        descs = [self.font(15).size(d)[0] for _, d in hints]
        total = sum(w + 8 + d for w, d in zip(widths, descs)) + 2 * 24
        x = card.centerx - total // 2
        y = card.bottom - 46
        for (key, desc), w, d in zip(hints, widths, descs):
            box = pygame.Rect(x, y, w, 28)
            pygame.draw.rect(surf, EDGE, box.move(0, 4), border_radius=6)
            pygame.draw.rect(surf, SOFT, box, border_radius=6)
            pygame.draw.rect(surf, LINE, box, width=2, border_radius=6)
            self.text(surf, key, 13, INK, box.center, "center", weight="medium")
            self.text(surf, desc, 15, MUTED, (x + w + 9, y + 4))
            x += w + 8 + d + 24

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
