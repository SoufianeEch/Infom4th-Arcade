"""
CODE SNAKE - complete the code, eat the right piece, dodge the bugs
--------------------------------------------------------------------
Install:  pip install pygame-ce
Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
Browser:  pygbag --build .          (see ../README.md)

HOW TO PLAY
  Every PHASE shows a piece of Python code with a blank.
  Steer the snake (Arrow keys or WASD) and eat the block that fills the blank.

  Eating the right block   -> phase cleared, snake grows, next phase (harder)
  Eating a wrong block     -> you lose a life (SyntaxError!)

CONSTRAINTS (they pile up as phases go by)
  Phase 1: just you and the code
  Phase 2: BUGS start roaming. A bug touching your head costs a life,
           a bug touching your body cuts your tail off.
  Phase 3: SyntaxError blocks appear (red). Don't touch them.
  Phase 4: the walls become DEADLY.
  Always : a countdown per phase, the snake speeds up, 3 lives.

KEYS   P = pause   ESC = menu   SPACE = (re)start

To add questions, add a dict to EASY / MEDIUM / HARD below.
"""

import asyncio
import json
import math
import random
import sys
from array import array
from pathlib import Path

import pygame

import arcade_web   # browser glue (no-ops on the desktop)
import paper_style as ps   # Notebook Paper look shared by the arcade games
from arcade_web import WEB, window, report_score, exit_to_arcade

# ---------------------------------------------------------------- settings
W, H = 1000, 640
FPS = 60
CELL = 28
COLS, ROWS = 34, 18
AX, AY = 24, 126                     # top-left corner of the arena (pixels)
ARENA = pygame.Rect(AX, AY, COLS * CELL, ROWS * CELL)
FOOD_W, FOOD_H = 5, 2                # an answer block is 5x2 cells
LIVES = 3
SCORES_FILE = Path(__file__).with_name("highscores_snake.json")
SCORES_KEY = "infom4th.code-snake.scores"      # browser storage key (web build)

UP, DOWN, LEFT, RIGHT = (0, -1), (0, 1), (-1, 0), (1, 0)
KEYMAP = {
    pygame.K_UP: UP, pygame.K_w: UP, pygame.K_DOWN: DOWN, pygame.K_s: DOWN,
    pygame.K_LEFT: LEFT, pygame.K_a: LEFT, pygame.K_RIGHT: RIGHT, pygame.K_d: RIGHT,
}

# ----------------------------------------------------- the code challenges
# "code": lines of code, "___" is the blank | "answer": the right piece
# "wrong": 3 wrong pieces                    | "why": shown after you clear it
EASY = [
    {"code": ["for i in ___(5):", "    print(i)"], "answer": "range", "wrong": ["len", "list", "input"],
     "why": "range(5) gives 0, 1, 2, 3, 4"},
    {"code": ["name = ___('Your name: ')"], "answer": "input", "wrong": ["print", "range", "str"],
     "why": "input() reads text typed by the user"},
    {"code": ["x = [1, 2, 3]", "x.___(4)"], "answer": "append", "wrong": ["add", "push", "put"],
     "why": "append() adds an item at the end of a list"},
    {"code": ["if x ___ 10:", "    print('ten')"], "answer": "==", "wrong": ["=", "=>", "!="],
     "why": "== compares two values, = assigns one"},
    {"code": ["___ add(a, b):", "    return a + b"], "answer": "def", "wrong": ["func", "fun", "lambda"],
     "why": "def defines a function"},
    {"code": ["print(___('abc'))   # 3"], "answer": "len", "wrong": ["size", "count", "length"],
     "why": "len() counts the items or characters"},
    {"code": ["word = 'hello'", "print(word.___())   # HELLO"], "answer": "upper", "wrong": ["caps", "big", "UP"],
     "why": "upper() returns the text in capitals"},
    {"code": ["import ___", "print(math.sqrt(16))"], "answer": "math", "wrong": ["maths", "sqrt", "number"],
     "why": "the module is called math"},
]
MEDIUM = [
    {"code": ["x = 0", "while x ___ 5:", "    x += 1"], "answer": "<", "wrong": [">", "==", "="],
     "why": "the loop runs while x < 5 is True"},
    {"code": ["nums = [3, 1, 2]", "nums.___()", "print(nums)   # [1, 2, 3]"], "answer": "sort",
     "wrong": ["order", "arrange", "sorted"], "why": "list.sort() sorts the list in place"},
    {"code": ["try:", "    x = int('abc')", "___ ValueError:"], "answer": "except", "wrong": ["catch", "rescue", "error"],
     "why": "try / except handles errors in Python"},
    {"code": ["d = {'a': 1}", "print(d['___'])   # 1"], "answer": "a", "wrong": ["1", "d", "key"],
     "why": "you read a dict value with its KEY"},
    {"code": ["squares = [n*n ___ n in range(3)]"], "answer": "for", "wrong": ["in", "of", "each"],
     "why": "this is a list comprehension"},
    {"code": ["text = 'a,b,c'", "parts = text.___(',')"], "answer": "split", "wrong": ["cut", "divide", "slice"],
     "why": "split() turns a string into a list"},
    {"code": ["x = 7 ___ 2   # 3 (whole division)"], "answer": "//", "wrong": ["/", "%", "**"],
     "why": "// is integer (floor) division"},
    {"code": ["with ___('file.txt') as f:", "    data = f.read()"], "answer": "open", "wrong": ["file", "read", "load"],
     "why": "open() opens a file"},
]
HARD = [
    {"code": ["class Dog:", "    def ___(self, name):", "        self.name = name"], "answer": "__init__",
     "wrong": ["init", "__start__", "__main__"], "why": "__init__ runs when an object is created"},
    {"code": ["def f(x):", "    ___ x * 2"], "answer": "return", "wrong": ["print", "give", "send"],
     "why": "return sends a value back to the caller"},
    {"code": ["nums = [1, 2, 3]", "print(nums[___])   # 3"], "answer": "-1", "wrong": ["3", "0", "len"],
     "why": "index -1 is the last item"},
    {"code": ["a = [1, 2]", "b = a.___()", "# b is an independent copy"], "answer": "copy",
     "wrong": ["clone", "dup", "same"], "why": "copy() makes a new list"},
    {"code": ["print('Hi' ___ 3)   # HiHiHi"], "answer": "*", "wrong": ["+", "x", "**"],
     "why": "str * int repeats the text"},
    {"code": ["x = None", "if x ___ None:", "    print('empty')"], "answer": "is", "wrong": ["===", "equals", "as"],
     "why": "use `is` to compare with None"},
    {"code": ["def add(a, b=___):", "    return a + b", "add(5)   # 5"], "answer": "0", "wrong": ["None", "1", "'0'"],
     "why": "b defaults to 0, so 5 + 0 = 5"},
    {"code": ["sq = lambda x: x ___ 2   # squares x"], "answer": "**", "wrong": ["^", "*", "//"],
     "why": "** is the power operator"},
    {"code": ["for i, v in ___(['a', 'b']):", "    print(i, v)"], "answer": "enumerate", "wrong": ["range", "zip", "count"],
     "why": "enumerate() gives (index, value) pairs"},
    {"code": ["s = {1, 2, 2, 3}", "print(len(s))   # ___"], "answer": "3", "wrong": ["4", "2", "1"],
     "why": "a set removes duplicates"},
]

NEW_RULE = {
    1: "Eat the block that fills the blank!",
    2: "NEW: BUGS roam the arena. Avoid them!",
    3: "NEW: red SyntaxError blocks!",
    4: "NEW: the walls are DEADLY!",
}

# ------------------------------------------------------------------ colors (Notebook Paper, light/dark by system)
WHITE, GREY = ps.INK, ps.INK_SOFT            # default text colours are ink on paper
GREEN, RED, ORANGE, GOLD, ICE = ps.GREEN, ps.RED, ps.ORANGE, ps.YELLOW, ps.BLUE


# ------------------------------------------------------------------ helpers
def make_tone(freq, ms, volume=0.25):
    rate = 22050
    n = int(rate * ms / 1000)
    data = array("h")
    for i in range(n):
        data.append(int(32767 * volume * (1 - i / n) * math.sin(2 * math.pi * freq * i / rate)))
    return pygame.mixer.Sound(buffer=data.tobytes())


def make_background():
    """Graph paper (flat colours)."""
    return ps.grid_surface(W, H)


def load_scores():
    try:
        if WEB:
            return json.loads(window.localStorage.getItem(SCORES_KEY) or "[]")
        return json.loads(SCORES_FILE.read_text())
    except Exception:
        return []


def save_scores(scores):
    try:
        if WEB:
            window.localStorage.setItem(SCORES_KEY, json.dumps(scores))
        else:
            SCORES_FILE.write_text(json.dumps(scores))
    except Exception:
        pass


def sign(n):
    return (n > 0) - (n < 0)


def cell_center(c, r):
    return (AX + c * CELL + CELL // 2, AY + r * CELL + CELL // 2)


# -------------------------------------------------------------------- game
class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Code Snake")
        self.screen = pygame.display.set_mode((W, H))
        self.canvas = pygame.Surface((W, H))
        self.clock = pygame.time.Clock()

        self.f_title = ps.title(120)
        self.f_big = ps.title(60)
        self.f_hud = ps.title(44)
        self.f_mid = ps.body(34)
        self.f_small = ps.body(24)
        self.f_code = ps.mono(23)                 # monospace: the blank and comments line up
        self.f_foods = [ps.title(s) for s in (34, 30, 26, 22, 18)]
        self.f_ops = [ps.mono(s, bold=True) for s in (34, 30, 26, 22)]

        self.background = make_background()
        self.sounds = {}
        try:
            pygame.mixer.init(22050, -16, 1, 512)
            self.sounds = {"ok": make_tone(700, 160), "bad": make_tone(130, 320, 0.35),
                           "clear": make_tone(990, 260), "cut": make_tone(300, 200)}
        except Exception:
            pass

        self.scores = load_scores()
        self.state = "menu"          # menu -> playing <-> clear -> name -> gameover
        self.paused = False
        self.name_input = ""
        self.last_rank = None
        self.particles, self.popups = [], []
        self.shake = 0.0
        self.time_alive = 0.0
        self.score = 0
        self.snippet = EASY[0]

    # ----------------------------------------------------------- utilities
    def play(self, name):
        if name in self.sounds:
            self.sounds[name].play()

    def popup(self, text, pos, color=WHITE):
        self.popups.append([text, pygame.Vector2(pos), 1.2, color])

    def burst(self, pos, color, n=26):
        for _ in range(n):
            a, s = random.uniform(0, math.tau), random.uniform(60, 280)
            self.particles.append([pygame.Vector2(pos), pygame.Vector2(math.cos(a), math.sin(a)) * s,
                                   random.uniform(0.4, 0.9), color])

    # ----------------------------------------------------------- game flow
    def new_game(self):
        self.score = 0
        self.lives = LIVES
        self.phase = 0
        self.pool = []
        self.used = set()
        self.last_rank = None
        self.state = "playing"
        self.paused = False
        self.next_phase()

    def pick_snippet(self):
        """Easy first, then medium, then hard (the pool mixes as you go)."""
        tier = min(self.phase // 4, 2)       # phases 1-4 easy, 5-8 medium, 9+ hard
        pools = [EASY, MEDIUM, HARD]
        candidates = [s for s in (pools[tier] if tier < 2 else MEDIUM + HARD) if id(s) not in self.used]
        if not candidates:
            self.used.clear()
            candidates = pools[tier] if tier < 2 else MEDIUM + HARD
        snippet = random.choice(candidates)
        self.used.add(id(snippet))
        return snippet

    def next_phase(self):
        self.phase += 1
        p = self.phase
        self.snippet = self.pick_snippet()
        self.filled = False
        self.explain = ""
        self.state = "playing"

        # --- difficulty settings for this phase
        self.move_interval = max(0.16 - p * 0.006, 0.075)
        self.phase_time = max(34 - p * 1.0, 16)
        self.time_left = self.phase_time
        self.walls_deadly = p >= 4
        n_bugs = 0 if p < 2 else min(1 + (p - 2) // 2, 5)
        n_obst = 0 if p < 3 else min(2 * (p - 2), 16)
        self.bug_interval = max(0.5 - p * 0.02, 0.26)
        self.chase_p = min(0.25 + 0.04 * p, 0.6)

        self.banner = (NEW_RULE.get(p, ""), 2.6)
        self.grace = 1.2           # bugs wait a moment when a phase begins
        self.bug_t = 0.0
        self.move_t = 0.0

        if p == 1:
            self.respawn(keep_invuln=False)
        self.build_arena(n_bugs, n_obst)

    def spawn_zone(self):
        cx, cy = COLS // 2, ROWS // 2
        return pygame.Rect(cx - 7, cy - 3, 14, 7)

    def build_arena(self, n_bugs, n_obst):
        zone = self.spawn_zone()
        pieces = [(self.snippet["answer"], True)] + [(w, False) for w in self.snippet["wrong"]]
        random.shuffle(pieces)
        self.foods, taken = [], []
        for text, ok in pieces:
            for _ in range(200):
                c, r = random.randint(0, COLS - FOOD_W), random.randint(0, ROWS - FOOD_H)
                rect = pygame.Rect(c, r, FOOD_W, FOOD_H)
                if rect.colliderect(zone) or any(rect.inflate(2, 2).colliderect(t) for t in taken):
                    continue
                if any(rect.inflate(6, 6).collidepoint(cell) for cell in self.snake):
                    continue          # never spawn on top of (or right next to) the snake
                break
            taken.append(rect)
            self.foods.append({"text": text, "ok": ok, "rect": rect})

        self.obst = set()
        for _ in range(n_obst):
            for _ in range(100):
                cell = (random.randrange(COLS), random.randrange(ROWS))
                if zone.collidepoint(cell) or any(t.collidepoint(cell) for t in taken) or cell in self.obst:
                    continue
                if cell in self.snake or abs(cell[0] - self.snake[0][0]) + abs(cell[1] - self.snake[0][1]) < 5:
                    continue
                self.obst.add(cell)
                break

        self.bugs = []
        for _ in range(n_bugs):
            for _ in range(100):
                cell = [random.randrange(COLS), random.randrange(ROWS)]
                far = abs(cell[0] - self.snake[0][0]) + abs(cell[1] - self.snake[0][1]) > 10
                if far and not zone.collidepoint(cell) and tuple(cell) not in self.obst:
                    self.bugs.append(cell)
                    break

    def respawn(self, keep_invuln=True):
        cx, cy = COLS // 2, ROWS // 2
        self.snake = [(cx - i, cy) for i in range(4)]
        self.dir = RIGHT
        self.dirq = []
        self.grow = 0
        self.invuln = 2.0 if keep_invuln else 1.0
        self.move_t = 0.0

    def lose_life(self, reason):
        self.lives -= 1
        self.shake = 0.35
        self.play("bad")
        self.burst(cell_center(*self.snake[0]), RED, 34)
        self.popup(reason, cell_center(*self.snake[0]), RED)
        if self.lives <= 0:
            qualifies = self.score > 0 and (len(self.scores) < 10 or self.score > min(s["score"] for s in self.scores))
            self.name_input = ""
            if WEB:
                # the arcade hub knows the player's name and keeps the shared leaderboard
                report_score(self.score)
                self.best_local = max(self.score, max((s["score"] for s in self.scores), default=0))
                self.scores = sorted(self.scores + [{"name": "YOU", "score": self.score}], key=lambda s: -s["score"])[:10]
                save_scores(self.scores)
                self.state = "gameover"
            else:
                self.state = "name" if qualifies else "gameover"
        else:
            self.respawn()

    # --------------------------------------------------------- snake logic
    def step(self):
        if self.dirq:
            self.dir = self.dirq.pop(0)
        nx, ny = self.snake[0][0] + self.dir[0], self.snake[0][1] + self.dir[1]
        if not (0 <= nx < COLS and 0 <= ny < ROWS):
            if self.walls_deadly and self.invuln <= 0:
                self.lose_life("Hit the wall!")
                return
            nx, ny = nx % COLS, ny % ROWS        # early phases: walls wrap around
        self.snake.insert(0, (nx, ny))
        if self.grow > 0:
            self.grow -= 1
        else:
            self.snake.pop()
        self.after_move()

    def after_move(self):
        head = self.snake[0]
        if self.invuln <= 0:
            if head in self.snake[1:]:
                return self.lose_life("Bit yourself!")
            if head in self.obst:
                return self.lose_life("SyntaxError!")
            if self.check_bugs():
                return
        for food in list(self.foods):
            r = food["rect"]
            if r.collidepoint(head):
                if food["ok"]:
                    self.on_correct()
                else:
                    self.foods.remove(food)
                    self.lose_life(f"'{food['text']}' is wrong!")
                return

    def check_bugs(self):
        """Returns True if the snake lost a life."""
        head = self.snake[0]
        for bug in self.bugs:
            cell = tuple(bug)
            if cell == head:
                self.lose_life("A bug got you!")
                return True
            if cell in self.snake[1:]:
                idx = self.snake.index(cell)
                if len(self.snake) > 3:
                    self.snake = self.snake[:max(3, idx)]
                    self.popup("CUT!", cell_center(*cell), ORANGE)
                    self.burst(cell_center(*cell), ORANGE, 14)
                    self.play("cut")
        return False

    def on_correct(self):
        pts = 100 + int(self.time_left) * 5 + self.phase * 10
        self.score += pts
        self.grow += 3
        self.filled = True
        self.explain = self.snippet["why"]
        self.burst(cell_center(*self.snake[0]), GREEN, 40)
        self.popup(f"+{pts}", cell_center(*self.snake[0]), GREEN)
        self.play("clear")
        self.state = "clear"
        self.clear_t = 1.9

    def move_bugs(self):
        hx, hy = self.snake[0]
        for bug in self.bugs:
            if random.random() < self.chase_p:
                dx, dy = hx - bug[0], hy - bug[1]
                step = (sign(dx), 0) if abs(dx) >= abs(dy) else (0, sign(dy))
            else:
                step = random.choice((UP, DOWN, LEFT, RIGHT))
            nx, ny = bug[0] + step[0], bug[1] + step[1]
            if 0 <= nx < COLS and 0 <= ny < ROWS and (nx, ny) not in self.obst:
                bug[0], bug[1] = nx, ny

    # -------------------------------------------------------------- update
    def update(self, dt):
        self.time_alive += dt
        self.shake = max(0.0, self.shake - dt)
        for part in self.particles:
            part[0] += part[1] * dt
            part[2] -= dt
        self.particles = [p for p in self.particles if p[2] > 0]
        for pop in self.popups:
            pop[1].y -= 45 * dt
            pop[2] -= dt
        self.popups = [p for p in self.popups if p[2] > 0]

        if self.state == "clear":
            self.clear_t -= dt
            if self.clear_t <= 0:
                self.next_phase()
            return
        if self.state != "playing" or self.paused:
            return

        self.invuln = max(0.0, self.invuln - dt)
        self.grace = max(0.0, self.grace - dt)
        text, t = self.banner
        self.banner = (text, max(0.0, t - dt))

        self.time_left -= dt
        if self.time_left <= 0:
            self.time_left = self.phase_time
            self.lose_life("Time's up!")
            return

        self.move_t += dt
        if self.move_t >= self.move_interval:
            self.move_t -= self.move_interval
            self.step()
            if self.state != "playing":
                return

        if self.grace <= 0 and self.bugs:
            self.bug_t += dt
            if self.bug_t >= self.bug_interval:
                self.bug_t -= self.bug_interval
                self.move_bugs()
                if self.invuln <= 0:
                    self.check_bugs()

    # ---------------------------------------------------------------- keys
    def on_key(self, event):
        key = event.key
        if self.state == "menu":
            if key == pygame.K_SPACE:
                self.new_game()
            elif key == pygame.K_ESCAPE:
                self.quit()
        elif self.state == "name":
            if key == pygame.K_RETURN:
                entry = {"name": self.name_input or "ANON", "score": self.score}
                self.scores = sorted(self.scores + [entry], key=lambda s: -s["score"])[:10]
                self.last_rank = entry
                save_scores(self.scores)
                self.state = "gameover"
            elif key == pygame.K_BACKSPACE:
                self.name_input = self.name_input[:-1]
            elif event.unicode and event.unicode.isalnum() and len(self.name_input) < 8:
                self.name_input += event.unicode.upper()
        elif self.state == "gameover":
            if key == pygame.K_SPACE:
                self.new_game()
            elif key == pygame.K_ESCAPE:
                self.state = "menu"
        else:  # playing / clear
            if key == pygame.K_ESCAPE:
                self.state = "menu"
            elif key == pygame.K_p:
                self.paused = not self.paused
            elif key in KEYMAP and self.state == "playing":
                new = KEYMAP[key]
                last = self.dirq[-1] if self.dirq else self.dir
                if new != last and (new[0] + last[0], new[1] + last[1]) != (0, 0) and len(self.dirq) < 2:
                    self.dirq.append(new)

    def quit(self):
        if WEB:                      # a browser tab cannot "exit": go back to the arcade menu
            exit_to_arcade()
            return
        pygame.quit()
        sys.exit()

    # ------------------------------------------------- touch / mouse (web + desktop)
    def on_pointer_down(self, pos):
        self.press = pos

    def on_pointer_up(self, pos):
        start, self.press = getattr(self, "press", None), None
        if start is None:
            return
        dx, dy = pos[0] - start[0], pos[1] - start[1]
        if max(abs(dx), abs(dy)) < 24:                       # a tap
            if self.state in ("menu", "gameover"):
                self.new_game()
            return
        new = (sign(dx), 0) if abs(dx) > abs(dy) else (0, sign(dy))
        if self.state == "playing":
            last = self.dirq[-1] if self.dirq else self.dir
            if new != last and (new[0] + last[0], new[1] + last[1]) != (0, 0) and len(self.dirq) < 2:
                self.dirq.append(new)

    # ------------------------------------------------------------- drawing
    def text(self, surf, txt, font, color, center):
        img = font.render(txt, True, color)
        surf.blit(img, img.get_rect(center=center))

    def code_text(self, surf, text, x, y):
        """Draw code text; anything after '#' is a grey comment. Returns the new x."""
        code, sep, comment = text.partition("#")
        for part, color in ((code, ps.INK), (sep + comment, ps.INK_FAINT)):
            if part:
                img = self.f_code.render(part, True, color)
                surf.blit(img, (x, y))
                x += img.get_width()
        return x

    def draw_code_panel(self, surf):
        panel = pygame.Rect(24, 8, 690, 106)
        ps.card(surf, panel, seed=3)
        lines = self.snippet["code"]
        y = panel.centery - len(lines) * 15 + 3
        for line in lines:
            x = panel.left + 22
            if "___" in line:
                pre, post = line.split("___", 1)
                x = self.code_text(surf, pre, x, y)
                if self.filled:
                    w = self.f_code.size(self.snippet["answer"])[0] + 14
                    pygame.draw.rect(surf, ps.HL, (x - 2, y, w, 28), border_radius=6)
                    self.text(surf, self.snippet["answer"], self.f_code, ps.GREEN, (x - 2 + w // 2, y + 14))
                else:
                    w = 104
                    box = pygame.Rect(x - 2, y, w, 28)
                    pygame.draw.rect(surf, ps.HL, box, border_radius=6)
                    if int(self.time_alive * 3) % 2 == 0:                      # a pencil-circled blank that blinks
                        ps.sketch_rect(surf, box, ps.RED, width=2, seed=11, amount=1.0)
                    self.text(surf, "?", self.f_code, ps.INK, box.center)
                self.code_text(surf, post, x + w, y)
            else:
                self.code_text(surf, line, x, y)
            y += 30

    def draw_hud(self, surf):
        x = 734
        self.text(surf, f"PHASE {self.phase}", self.f_hud, ps.INK, (x + 62, 26))
        img = self.f_hud.render(f"{self.score}", True, ps.BLUE)
        surf.blit(img, img.get_rect(topright=(W - 24, 6)))
        for i in range(self.lives):
            cx, cy = x + 12 + i * 30, 68
            pygame.draw.circle(surf, ps.RED, (cx, cy), 11)
            pygame.draw.circle(surf, ps.INK, (cx, cy), 11, 2)
        best = self.scores[0]["score"] if self.scores else 0
        self.text(surf, f"best {best}", self.f_small, ps.INK_SOFT, (W - 70, 68))
        ratio = max(self.time_left, 0) / self.phase_time
        bar = pygame.Rect(x, 88, W - 24 - x, 16)
        pygame.draw.rect(surf, ps.CARD, bar, border_radius=8)
        if ratio > 0:
            pygame.draw.rect(surf, ps.BLUE if ratio > 0.35 else ps.RED, (x, 88, max(16, int(bar.w * ratio)), 16), border_radius=8)
        pygame.draw.rect(surf, ps.INK, bar, width=2, border_radius=8)

    def draw_snake(self, surf):
        if self.invuln > 0 and int(self.time_alive * 12) % 2 == 0:
            return
        n = len(self.snake)
        for i in range(n - 1, -1, -1):
            c, r = self.snake[i]
            rect = pygame.Rect(AX + c * CELL + 2, AY + r * CELL + 2, CELL - 4, CELL - 4)
            fill = ps.BLUE if i % 2 == 0 else ps.INK_SOFT if ps.DARK else (96, 140, 255)
            pygame.draw.rect(surf, fill, rect, border_radius=8 if i else 11)
            pygame.draw.rect(surf, ps.INK, rect, width=2, border_radius=8 if i else 11)
        # eyes on the head
        hx, hy = cell_center(*self.snake[0])
        dx, dy = self.dir
        for side in (-1, 1):
            ex = hx + dx * 6 + (-dy) * 6 * side
            ey = hy + dy * 6 + dx * 6 * side
            pygame.draw.circle(surf, (255, 255, 255), (ex, ey), 4)
            pygame.draw.circle(surf, (20, 30, 70), (ex + dx, ey + dy), 2)

    def draw_bug(self, surf, bug):
        x, y = cell_center(*bug)
        for off in (-6, 0, 6):
            pygame.draw.line(surf, ps.INK, (x - 11, y + off), (x + 11, y + off), 2)
        pygame.draw.line(surf, ps.INK, (x - 3, y - 8), (x - 7, y - 13), 2)
        pygame.draw.line(surf, ps.INK, (x + 3, y - 8), (x + 7, y - 13), 2)
        pygame.draw.circle(surf, ps.ORANGE, (x, y), 9)
        pygame.draw.circle(surf, ps.INK, (x, y), 9, 2)
        pygame.draw.circle(surf, ps.INK, (x - 3, y - 3), 2)
        pygame.draw.circle(surf, ps.INK, (x + 3, y - 3), 2)

    def draw_world(self, surf):
        surf.blit(self.background, (0, 0))
        pygame.draw.rect(surf, ps.CARD, ARENA)
        for c in range(COLS + 1):
            pygame.draw.line(surf, ps.GRID, (AX + c * CELL, AY), (AX + c * CELL, AY + ROWS * CELL))
        for r in range(ROWS + 1):
            pygame.draw.line(surf, ps.GRID, (AX, AY + r * CELL), (AX + COLS * CELL, AY + r * CELL))
        if self.walls_deadly:
            pygame.draw.rect(surf, ps.RED, ARENA.inflate(8, 8), width=5, border_radius=4)
        ps.sketch_rect(surf, ARENA, ps.RED if self.walls_deadly else ps.INK, width=3, seed=5, amount=1.2)

        for food in self.foods:
            r = food["rect"]
            px = pygame.Rect(AX + r.x * CELL + 2, AY + r.y * CELL + 2, r.w * CELL - 4, r.h * CELL - 4)
            fill, edge = ps.CARD, ps.INK
            if self.state == "clear":
                fill, edge = (ps.HL, ps.GREEN) if food["ok"] else (ps.PAPER, ps.INK_FAINT)
            ps.card(surf, px, fill=fill, border=edge, seed=r.x * 7 + r.y)
            fonts = self.f_foods if any(ch.isalpha() for ch in food["text"]) else self.f_ops      # operators read better in the monospace font
            font = next((f for f in fonts if f.size(food["text"])[0] <= px.w - 14), fonts[-1])
            self.text(surf, food["text"], font, ps.INK if self.state != "clear" or food["ok"] else ps.INK_FAINT, px.center)

        for c, r in self.obst:
            px = pygame.Rect(AX + c * CELL + 3, AY + r * CELL + 3, CELL - 6, CELL - 6)
            pygame.draw.rect(surf, ps.RED, px, border_radius=5)
            pygame.draw.rect(surf, ps.INK, px, width=2, border_radius=5)
            self.text(surf, "!", self.f_small, (255, 255, 255), px.center)

        for bug in self.bugs:
            self.draw_bug(surf, bug)
        self.draw_snake(surf)

        for pos, _, life, color in self.particles:
            pygame.draw.circle(surf, color, (int(pos.x), int(pos.y)), max(1, int(life * 7)))
        for txt, pos, life, color in self.popups:
            self.text(surf, txt, self.f_mid, ps.INK if color in (WHITE, GREY) else color, (int(pos.x), int(pos.y) - 24))

        self.draw_code_panel(surf)
        self.draw_hud(surf)

        text, t = self.banner
        if text and t > 0 and self.state == "playing":
            box = pygame.Rect(0, 0, 660, 54)
            box.center = (ARENA.centerx, ARENA.top + 60)
            ps.card(surf, box, fill=ps.HL, seed=9)
            self.text(surf, text, self.f_mid, ps.INK, box.center)
        if self.state == "clear":
            box = pygame.Rect(0, 0, 740, 100)
            box.center = (ARENA.centerx, ARENA.centery)
            ps.card(surf, box, border=ps.GREEN, seed=13, width=3)
            self.text(surf, "PHASE CLEARED!", self.f_big, ps.GREEN, (box.centerx, box.top + 30))
            self.text(surf, self.explain, self.f_mid, ps.INK, (box.centerx, box.top + 70))
        if self.paused:
            box = pygame.Rect(0, 0, 460, 90)
            box.center = ARENA.center
            ps.card(surf, box, seed=21)
            self.text(surf, "PAUSED  (P to resume)", self.f_big, ps.INK, box.center)

    def draw_leaderboard(self, surf, x, y, limit=5, highlight=None):
        self.text(surf, "LEADERBOARD", self.f_big, ps.RED, (x, y))
        if not self.scores:
            self.text(surf, "no scores yet - be the first!", self.f_small, ps.INK_SOFT, (x, y + 46))
        for i, s in enumerate(self.scores[:limit]):
            color = ps.GREEN if s is highlight else ps.INK
            self.text(surf, f"{i + 1}. {s['name']:<8} {s['score']:>6}", self.f_mid, color, (x, y + 46 + i * 32))

    def paper_page(self, s):
        """Menu / game-over backdrop: graph paper with the red margin line."""
        s.blit(self.background, (0, 0))
        pygame.draw.line(s, ps.RED, (70, 0), (70, H), 2)

    def draw(self):
        s = self.canvas
        if self.state == "menu":
            self.paper_page(s)
            self.text(s, "CODE SNAKE", self.f_title, ps.BLUE, (W // 2, 92))
            self.text(s, "Fill the blank. Eat the right code. Survive the bugs.", self.f_mid, ps.INK_SOFT, (W // 2, 160))
            tips = ["Arrow keys / WASD (or swipe) to steer",
                    "Eat the block that completes the code",
                    "Wrong block = lose a life",
                    "Bugs, SyntaxErrors and deadly walls appear as you progress"]
            for i, tip in enumerate(tips):
                self.text(s, tip, self.f_mid, ps.INK, (W // 2, 232 + i * 38))
            btn = pygame.Rect(0, 0, 440, 62)
            btn.center = (W // 2, 424)
            ps.pill(s, btn, ps.BLUE)
            self.text(s, "Press SPACE to start", self.f_hud, ps.ON_BLUE, btn.center)
            self.draw_leaderboard(s, W // 2, 500, limit=3)
        else:
            self.draw_world(s)
            if self.state in ("name", "gameover"):
                veil = pygame.Surface((W, H), pygame.SRCALPHA)
                veil.fill((*ps.PAPER, 235))
                s.blit(veil, (0, 0))
                pygame.draw.line(s, ps.RED, (70, 0), (70, H), 2)
                if self.state == "name":
                    self.text(s, "NEW HIGH SCORE!", self.f_title, ps.RED, (W // 2, 190))
                    self.text(s, f"{self.score} points - reached phase {self.phase}", self.f_big, ps.INK, (W // 2, 280))
                    self.text(s, "Type your name + Enter:", self.f_mid, ps.INK_SOFT, (W // 2, 350))
                    cursor = "_" if (pygame.time.get_ticks() // 400) % 2 == 0 else " "
                    self.text(s, self.name_input + cursor, self.f_title, ps.BLUE, (W // 2, 425))
                else:
                    self.text(s, "GAME OVER", self.f_title, ps.RED, (W // 2, 90))
                    self.text(s, f"Score {self.score}   -   Phase {self.phase}", self.f_big, ps.INK, (W // 2, 170))
                    self.draw_leaderboard(s, W // 2, 245, limit=10, highlight=self.last_rank)
                    self.text(s, "SPACE: try again     ESC: menu", self.f_mid, ps.BLUE, (W // 2, 610))

        ox = oy = 0
        if self.shake > 0:
            ox, oy = random.randint(-6, 6), random.randint(-6, 6)
        self.screen.fill(ps.PAPER)
        self.screen.blit(s, (ox, oy))
        pygame.display.flip()

    # ------------------------------------------------------------ main loop
    async def run(self):
        # async + `await asyncio.sleep(0)` hands control back to the browser each frame.
        # On the desktop it behaves like the original blocking loop.
        while True:
            dt = min(self.clock.tick(FPS) / 1000, 0.05)
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.quit()
                if event.type == pygame.KEYDOWN:
                    self.on_key(event)
                elif event.type == pygame.MOUSEBUTTONDOWN:
                    self.on_pointer_down(event.pos)
                elif event.type == pygame.MOUSEBUTTONUP:
                    self.on_pointer_up(event.pos)
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)


async def main():
    await Game().run()


if __name__ == "__main__":
    asyncio.run(main())