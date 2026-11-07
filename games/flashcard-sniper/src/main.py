"""
FLASHCARD SNIPER - learn Python by shooting the right answer
-------------------------------------------------------------
Install:  pip install pygame-ce
Run:      python main.py            (desktop)
Browser:  npm run build:py           (see ../README.md)

How to play:
  - A Python question (the flashcard) shows at the top.
  - Answer cards float across the screen.
  - Move the mouse to aim your scope, LEFT CLICK to shoot the correct answer.
  - Wrong answer or timeout = lose a life. 3 lives. Faster = more points.

Want to add questions? Just add a dict to the CARDS list below.
"""

import asyncio
import math
import random
import sys
from pathlib import Path

import pygame

import arcade_web   # no-ops on the desktop; talks to the arcade hub in the browser

BEST_KEY = "infom4th.flashcard-sniper.best"


# ---------------------------------------------------------------- fonts (DotGothic16, bundled in fonts/)
FONT_DIR = Path(__file__).resolve().parent / "fonts"
PIXEL_FONT = "DotGothic16-Latin.ttf"


def _font(size):
    try:
        return pygame.font.Font(str(FONT_DIR / PIXEL_FONT), size)
    except Exception:                        # missing file: fall back to pygame's built-in font
        return pygame.font.Font(None, size)


def ui_font(size):
    """DotGothic16 is a pixel font: sizes that are multiples of 8 stay crisp. `size` is the old built-in-font size."""
    return _font(max(16, round(size * 0.8 / 8) * 8))


def mono_font(size):
    return _font(max(16, round(size / 8) * 8))
# ---------------------------------------------------------------- settings
WIDTH, HEIGHT = 960, 600
FPS = 60
LIVES = 3
QUESTION_TIME = 15        # seconds per question
SCOPE_RADIUS = 110        # size of the visible circle in the scope
SWAY = 4                  # how much the scope shakes (0 = steady hands)
REVEAL_TIME = 1.8         # seconds the answer stays on screen

# ------------------------------------------------------- the flashcard deck
# "q" = question, "a" = correct answer, "wrong" = wrong answers (3 of them)
CARDS = [
    {"q": "Which function prints text on the screen?", "a": "print()",
     "wrong": ["echo()", "write()", "display()"]},
    {"q": "What does len([4, 8, 15]) return?", "a": "3",
     "wrong": ["4", "15", "2"]},
    {"q": "Which keyword defines a function?", "a": "def",
     "wrong": ["func", "function", "lambda()"]},
    {"q": "Which type is the value 3.14 ?", "a": "float",
     "wrong": ["int", "str", "decimal"]},
    {"q": "What is the result of 7 // 2 ?", "a": "3",
     "wrong": ["3.5", "4", "2"]},
    {"q": "What is the result of 2 ** 3 ?", "a": "8",
     "wrong": ["6", "5", "9"]},
    {"q": "Which symbol starts a comment?", "a": "#",
     "wrong": ["//", "/*", "--"]},
    {"q": "Which structure is immutable?", "a": "tuple",
     "wrong": ["list", "dict", "set"]},
    {"q": "How do you add 5 to the list nums ?", "a": "nums.append(5)",
     "wrong": ["nums.add(5)", "nums.push(5)", "nums + 5"]},
    {"q": "What does range(3) produce?", "a": "0, 1, 2",
     "wrong": ["1, 2, 3", "0, 1, 2, 3", "3, 2, 1"]},
    {"q": "Which keyword starts a loop over items?", "a": "for",
     "wrong": ["loop", "foreach", "each"]},
    {"q": "What is the result of 'ab' * 2 ?", "a": "'abab'",
     "wrong": ["'ab2'", "Error", "'aabb'"]},
    {"q": "Which is the key/value structure?", "a": "dict",
     "wrong": ["list", "tuple", "array"]},
    {"q": "What does 'hello'.upper() return?", "a": "'HELLO'",
     "wrong": ["'Hello'", "'hello'", "None"]},
    {"q": "How do you read user input?", "a": "input()",
     "wrong": ["read()", "scan()", "get()"]},
    {"q": "What does bool(0) return?", "a": "False",
     "wrong": ["True", "0", "None"]},
    {"q": "Which operator checks equality?", "a": "==",
     "wrong": ["=", "===", "is not"]},
    {"q": "Which keyword imports a module?", "a": "import",
     "wrong": ["include", "using", "require"]},
]

# ------------------------------------------------------------------ colors
BG_TOP = (18, 22, 38)
BG_BOTTOM = (40, 30, 60)
WHITE = (240, 240, 245)
GREY = (150, 155, 175)
CARD = (70, 90, 160)
CARD_EDGE = (140, 160, 235)
GREEN = (70, 200, 120)
RED = (230, 80, 90)
GOLD = (250, 205, 90)


# ------------------------------------------------------------------ helpers
def wrap_text(text, font, max_width):
    """Split text into lines so each line fits in max_width pixels."""
    words = text.split(" ")
    lines, current = [], ""
    for word in words:
        test = (current + " " + word).strip()
        if font.size(test)[0] <= max_width:
            current = test
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_text_center(surface, text, font, color, center):
    img = font.render(text, True, color)
    surface.blit(img, img.get_rect(center=center))


def make_background():
    """Flat background (no gradient)."""
    surf = pygame.Surface((WIDTH, HEIGHT))
    surf.fill(BG_TOP)
    return surf


# ------------------------------------------------------------------ target
class Target:
    """One floating answer card."""

    W, H = 190, 74

    def __init__(self, text, is_correct, lane_y, speed):
        self.text = text
        self.is_correct = is_correct
        self.rect = pygame.Rect(random.randint(0, WIDTH - self.W), lane_y, self.W, self.H)
        self.vx = speed * random.choice((-1, 1))

    def update(self, dt):
        self.rect.x += self.vx * dt
        # bounce on the screen edges
        if self.rect.left < 0 or self.rect.right > WIDTH:
            self.vx *= -1
            self.rect.clamp_ip(pygame.Rect(0, 0, WIDTH, HEIGHT))

    def draw(self, surface, font, state="normal"):
        fill, edge = CARD, CARD_EDGE
        if state == "correct":
            fill, edge = (40, 140, 85), GREEN
        elif state == "wrong":
            fill, edge = (150, 50, 60), RED
        elif state == "dim":
            fill, edge = (45, 50, 80), (80, 85, 120)
        pygame.draw.rect(surface, (6, 10, 30), self.rect.move(0, 7), border_radius=12)   # hard 3D shadow
        pygame.draw.rect(surface, fill, self.rect, border_radius=12)
        pygame.draw.rect(surface, edge, self.rect, width=3, border_radius=12)
        pygame.draw.line(surface, (255, 255, 255), (self.rect.left + 12, self.rect.top + 6), (self.rect.right - 12, self.rect.top + 6), 2)
        draw_text_center(surface, self.text, font, WHITE, self.rect.center)


# -------------------------------------------------------------------- game
class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Flashcard Sniper")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        pygame.mouse.set_visible(False)  # we draw our own crosshair

        self.font_big = ui_font(72)
        self.font_mid = ui_font(40)
        self.font_card = ui_font(32)
        self.font_small = ui_font(26)

        self.background = make_background()
        # The "darkness" layer for the scope effect (has per-pixel alpha)
        self.darkness = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)

        self.state = "menu"      # menu -> playing -> reveal -> (playing | gameover)
        self.high_score = int(arcade_web.store_get(BEST_KEY, 0) or 0)   # persists in the browser only
        self.time_alive = 0.0    # used for the scope sway
        self.reset()

    # ---------------------------------------------------------- game logic
    def reset(self):
        self.score = 0
        self.lives = LIVES
        self.streak = 0
        self.deck = []
        self.targets = []
        self.card = None
        self.time_left = QUESTION_TIME
        self.reveal_left = 0
        self.message = ""
        self.message_color = WHITE
        self.shot_pos = None

    def next_question(self):
        if not self.deck:                       # reshuffle when the deck is empty
            self.deck = random.sample(CARDS, len(CARDS))
        self.card = self.deck.pop()
        self.time_left = QUESTION_TIME

        answers = [(self.card["a"], True)] + [(w, False) for w in self.card["wrong"]]
        random.shuffle(answers)

        # 4 lanes (rows) so the cards don't overlap vertically
        lanes = [190, 285, 380, 475]
        self.targets = []
        for (text, ok), lane_y in zip(answers, lanes):
            speed = random.randint(90, 170) + self.streak * 6   # gets harder
            self.targets.append(Target(text, ok, lane_y, speed))
        self.state = "playing"

    def aim_point(self):
        """Mouse position + a little sway so the scope feels hand-held."""
        mx, my = pygame.mouse.get_pos()
        t = self.time_alive
        return (mx + math.sin(t * 1.3) * SWAY, my + math.cos(t * 1.7) * SWAY)

    def shoot(self):
        aim = self.aim_point()
        self.shot_pos = aim
        for target in self.targets:
            if target.rect.collidepoint(aim):
                if target.is_correct:
                    bonus = int(self.time_left)              # faster = more points
                    self.score += 10 + bonus
                    self.streak += 1
                    self.end_round(f"Correct!  +{10 + bonus}", GREEN)
                else:
                    self.lose_life(f"Wrong!  Answer: {self.card['a']}")
                return
        # Clicked empty space: no penalty, just a miss.
        self.message = "Miss!"
        self.message_color = GREY

    def lose_life(self, text):
        self.lives -= 1
        self.streak = 0
        self.end_round(text, RED)

    def end_round(self, text, color):
        self.message = text
        self.message_color = color
        self.reveal_left = REVEAL_TIME
        self.state = "reveal"

    def update(self, dt):
        self.time_alive += dt

        if self.state == "playing":
            for t in self.targets:
                t.update(dt)
            self.time_left -= dt
            if self.time_left <= 0:
                self.lose_life(f"Time's up!  Answer: {self.card['a']}")

        elif self.state == "reveal":
            self.reveal_left -= dt
            if self.reveal_left <= 0:
                if self.lives <= 0:
                    self.high_score = max(self.high_score, self.score)
                    arcade_web.store_set(BEST_KEY, self.high_score)
                    arcade_web.report_score(self.score)       # -> shared leaderboard (browser only)
                    self.state = "gameover"
                else:
                    self.next_question()

    # ------------------------------------------------------------- drawing
    def draw_scene(self, reveal=False):
        """Draw everything that lives 'under' the scope."""
        self.screen.blit(self.background, (0, 0))

        # Flashcard (the question) at the top
        card_rect = pygame.Rect(60, 70, WIDTH - 120, 90)
        pygame.draw.rect(self.screen, (30, 35, 60), card_rect, border_radius=14)
        pygame.draw.rect(self.screen, GOLD, card_rect, width=3, border_radius=14)
        draw_text_center(self.screen, self.card["q"], self.font_mid, WHITE, card_rect.center)

        for target in self.targets:
            if reveal:
                state = "correct" if target.is_correct else "dim"
                if self.message_color == RED and not target.is_correct and \
                        self.shot_pos and target.rect.collidepoint(self.shot_pos):
                    state = "wrong"
            else:
                state = "normal"
            target.draw(self.screen, self.font_card, state)

    def draw_hud(self):
        self.screen.blit(self.font_small.render(f"Score: {self.score}", True, WHITE), (20, 15))
        self.screen.blit(self.font_small.render(f"Best: {self.high_score}", True, GREY), (20, 40))
        self.screen.blit(self.font_small.render(f"Streak: {self.streak}", True, GOLD), (150, 15))
        # lives as hearts (little red circles)
        for i in range(self.lives):
            pygame.draw.circle(self.screen, RED, (WIDTH - 35 - i * 34, 28), 12)
        # timer bar
        ratio = max(self.time_left, 0) / QUESTION_TIME
        bar = pygame.Rect(60, 175 - 8, int((WIDTH - 120) * ratio), 6)
        color = GREEN if ratio > 0.4 else RED
        pygame.draw.rect(self.screen, color, bar, border_radius=3)

    def draw_scope(self):
        """Darken everything except a circle around the aim point + crosshair."""
        ax, ay = self.aim_point()
        self.darkness.fill((0, 0, 0, 235))
        pygame.draw.circle(self.darkness, (0, 0, 0, 0), (ax, ay), SCOPE_RADIUS)  # the hole
        self.screen.blit(self.darkness, (0, 0))

        pygame.draw.circle(self.screen, (10, 10, 10), (ax, ay), SCOPE_RADIUS, width=6)
        pygame.draw.line(self.screen, RED, (ax - SCOPE_RADIUS, ay), (ax + SCOPE_RADIUS, ay), 1)
        pygame.draw.line(self.screen, RED, (ax, ay - SCOPE_RADIUS), (ax, ay + SCOPE_RADIUS), 1)
        pygame.draw.circle(self.screen, RED, (ax, ay), 3)

    def draw(self):
        if self.state == "menu":
            self.screen.blit(self.background, (0, 0))
            draw_text_center(self.screen, "FLASHCARD SNIPER", self.font_big, GOLD, (WIDTH // 2, 170))
            lines = [
                "Read the Python question.",
                "Aim your scope with the mouse.",
                "Left click to shoot the CORRECT answer.",
                f"{LIVES} lives. Faster shots = more points.",
            ]
            for i, line in enumerate(lines):
                draw_text_center(self.screen, line, self.font_mid, WHITE, (WIDTH // 2, 270 + i * 44))
            draw_text_center(self.screen, "Click to start", self.font_mid, GREEN, (WIDTH // 2, 500))

        elif self.state == "playing":
            self.draw_scene(reveal=False)
            self.draw_scope()
            self.draw_hud()

        elif self.state == "reveal":
            self.draw_scene(reveal=True)       # no scope: the card "flips" open
            self.draw_hud()
            draw_text_center(self.screen, self.message, self.font_big, self.message_color,
                             (WIDTH // 2, 28))

        elif self.state == "gameover":
            self.screen.blit(self.background, (0, 0))
            draw_text_center(self.screen, "GAME OVER", self.font_big, RED, (WIDTH // 2, 200))
            draw_text_center(self.screen, f"Score: {self.score}", self.font_mid, WHITE, (WIDTH // 2, 290))
            draw_text_center(self.screen, f"Best: {self.high_score}", self.font_mid, GOLD, (WIDTH // 2, 340))
            draw_text_center(self.screen, "Click to play again", self.font_mid, GREEN, (WIDTH // 2, 440))

        # crosshair cursor on non-scope screens
        if self.state in ("menu", "reveal", "gameover"):
            mx, my = pygame.mouse.get_pos()
            pygame.draw.circle(self.screen, RED, (mx, my), 10, width=2)
            pygame.draw.circle(self.screen, RED, (mx, my), 2)

        pygame.display.flip()

    # ------------------------------------------------------------ main loop
    def handle_click(self):
        if self.state == "menu":
            self.reset()
            self.next_question()
        elif self.state == "playing":
            self.shoot()
        elif self.state == "gameover":
            self.reset()
            self.next_question()

    def quit(self):
        if arcade_web.WEB:               # a browser tab cannot exit: go back to the arcade menu
            arcade_web.exit_to_arcade()
            return
        pygame.quit()
        sys.exit()

    async def run(self):
        # async + `await asyncio.sleep(0)` hands control back to the browser every frame;
        # on the desktop it behaves like the original blocking loop.
        while True:
            dt = self.clock.tick(FPS) / 1000   # seconds since last frame
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.quit()
                if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                    self.quit()
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    self.handle_click()
            self.update(dt)
            self.draw()
            await asyncio.sleep(0)


async def main():
    await Game().run()


if __name__ == "__main__":
    asyncio.run(main())
