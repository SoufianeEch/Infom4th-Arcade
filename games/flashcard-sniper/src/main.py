"""
FLASHCARD SNIPER - learn Python by shooting the right answer
-------------------------------------------------------------
Install:  pip install pygame-ce
Run:      python main.py            (desktop; ARCADE_THEME=light|dark forces the colours)
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


import paper_style as ps   # Notebook Paper look shared by the arcade games

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
# Notebook Paper colours (light/dark by system)
WHITE, GREY = ps.INK, ps.INK_SOFT
CARD, CARD_EDGE = ps.CARD, ps.INK
GREEN, RED, GOLD = ps.GREEN, ps.RED, ps.YELLOW


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
    """Graph paper (flat colours)."""
    return ps.grid_surface(WIDTH, HEIGHT)


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
        fill, edge = ps.CARD, ps.INK
        if state == "correct":
            fill, edge = ps.HL, ps.GREEN
        elif state == "wrong":
            fill, edge = ps.CARD, ps.RED
        elif state == "dim":
            fill, edge = ps.PAPER, ps.INK_FAINT
        ps.card(surface, self.rect, fill=fill, border=edge, seed=self.rect.y * 3 + len(self.text), width=3 if state in ("correct", "wrong") else 2)
        color = ps.INK_FAINT if state == "dim" else ps.INK
        font = ps.mono(30, bold=True) if not any(ch.isalpha() for ch in self.text) else font
        draw_text_center(surface, self.text, font, color, self.rect.center)


# -------------------------------------------------------------------- game
class Game:
    def __init__(self):
        pygame.init()
        pygame.display.set_caption("Flashcard Sniper")
        self.screen = pygame.display.set_mode((WIDTH, HEIGHT))
        self.clock = pygame.time.Clock()
        pygame.mouse.set_visible(False)  # we draw our own crosshair

        self.font_big = ps.title(76)
        self.font_mid = ps.body(36)
        self.font_card = ps.title(34)
        self.font_small = ps.body(26)

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

        # Flashcard (the question) at the top: a paper index card with a red top line
        card_rect = pygame.Rect(60, 70, WIDTH - 120, 90)
        ps.card(self.screen, card_rect, seed=7)
        pygame.draw.line(self.screen, ps.RED, (card_rect.left + 14, card_rect.top + 26), (card_rect.right - 14, card_rect.top + 26), 2)
        lines = wrap_text(self.card["q"], self.font_mid, card_rect.w - 40)
        for i, line in enumerate(lines[:2]):
            draw_text_center(self.screen, line, self.font_mid, ps.INK, (card_rect.centerx, card_rect.top + 52 + i * 30 - (0 if len(lines) > 1 else -6)))

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
        # the scope overlay is dark, so the HUD text switches to the card colour while aiming
        aiming = self.state == "playing"
        ink, soft, accent = (ps.CARD, ps.GRID, ps.CARD) if aiming else (ps.INK, ps.INK_SOFT, ps.BLUE)
        self.screen.blit(self.font_small.render(f"Score: {self.score}", True, ink), (20, 12))
        self.screen.blit(self.font_small.render(f"Best: {self.high_score}", True, soft), (20, 40))
        self.screen.blit(self.font_small.render(f"Streak: {self.streak}", True, accent), (170, 12))
        # lives as hearts (little red circles)
        for i in range(self.lives):
            cx, cy = WIDTH - 35 - i * 34, 28
            pygame.draw.circle(self.screen, ps.RED, (cx, cy), 12)
            pygame.draw.circle(self.screen, ps.INK, (cx, cy), 12, 2)
        # timer bar
        ratio = max(self.time_left, 0) / QUESTION_TIME
        track = pygame.Rect(60, 167, WIDTH - 120, 10)
        pygame.draw.rect(self.screen, ps.CARD, track, border_radius=5)
        if ratio > 0:
            pygame.draw.rect(self.screen, ps.BLUE if ratio > 0.4 else ps.RED, (60, 167, max(10, int(track.w * ratio)), 10), border_radius=5)
        pygame.draw.rect(self.screen, ps.INK, track, width=2, border_radius=5)

    def draw_scope(self):
        """Dim everything except a circle around the aim point (like looking through a pencil-drawn scope)."""
        ax, ay = self.aim_point()
        self.darkness.fill((*ps.INK_DIM, 238))
        pygame.draw.circle(self.darkness, (0, 0, 0, 0), (ax, ay), SCOPE_RADIUS)  # the hole
        self.screen.blit(self.darkness, (0, 0))

        pygame.draw.circle(self.screen, ps.INK, (ax, ay), SCOPE_RADIUS, width=5)
        pygame.draw.line(self.screen, ps.RED, (ax - SCOPE_RADIUS, ay), (ax + SCOPE_RADIUS, ay), 2)
        pygame.draw.line(self.screen, ps.RED, (ax, ay - SCOPE_RADIUS), (ax, ay + SCOPE_RADIUS), 2)
        pygame.draw.circle(self.screen, ps.RED, (ax, ay), 4)

    def paper_page(self):
        self.screen.blit(self.background, (0, 0))
        pygame.draw.line(self.screen, ps.RED, (70, 0), (70, HEIGHT), 2)

    def draw(self):
        if self.state == "menu":
            self.paper_page()
            draw_text_center(self.screen, "FLASHCARD SNIPER", ps.title(96), ps.BLUE, (WIDTH // 2, 150))
            lines = [
                "Read the Python question.",
                "Aim your scope with the mouse.",
                "Left click to shoot the CORRECT answer.",
                f"{LIVES} lives. Faster shots = more points.",
            ]
            for i, line in enumerate(lines):
                draw_text_center(self.screen, line, self.font_mid, ps.INK, (WIDTH // 2, 250 + i * 42))
            btn = pygame.Rect(0, 0, 360, 62)
            btn.center = (WIDTH // 2, 480)
            ps.pill(self.screen, btn, ps.BLUE)
            draw_text_center(self.screen, "Click to start", ps.title(44), ps.ON_BLUE, btn.center)

        elif self.state == "playing":
            self.draw_scene(reveal=False)
            self.draw_scope()
            self.draw_hud()

        elif self.state == "reveal":
            self.draw_scene(reveal=True)       # no scope: the card "flips" open
            self.draw_hud()
            draw_text_center(self.screen, self.message, ps.title(52), self.message_color, (WIDTH // 2, 32))

        elif self.state == "gameover":
            self.paper_page()
            draw_text_center(self.screen, "GAME OVER", ps.title(100), ps.RED, (WIDTH // 2, 190))
            draw_text_center(self.screen, f"Score: {self.score}", self.font_mid, ps.INK, (WIDTH // 2, 290))
            draw_text_center(self.screen, f"Best: {self.high_score}", self.font_mid, ps.BLUE, (WIDTH // 2, 340))
            btn = pygame.Rect(0, 0, 420, 62)
            btn.center = (WIDTH // 2, 450)
            ps.pill(self.screen, btn, ps.BLUE)
            draw_text_center(self.screen, "Click to play again", ps.title(44), ps.ON_BLUE, btn.center)

        # pencil-circle cursor on non-scope screens
        if self.state in ("menu", "reveal", "gameover"):
            mx, my = pygame.mouse.get_pos()
            pygame.draw.circle(self.screen, ps.RED, (mx, my), 11, width=2)
            pygame.draw.circle(self.screen, ps.RED, (mx, my), 2)

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
