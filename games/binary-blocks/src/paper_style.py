"""Notebook Paper look for the pygame games (matches the arcade website).

Graph paper, pencil-blue ink, red margin line, hand-drawn wobbly boxes with a hard offset shadow.
Dark/light follows the system setting (arcade_web.prefers_dark(); desktop: ARCADE_THEME=light forces light).
Source of truth: shared/python/paper_style.py (scripts/build-python-games.sh copies it, and fonts/, into each game's src/).
"""
import random
from pathlib import Path

import pygame

import arcade_web

DARK = arcade_web.prefers_dark()
if DARK:
    PAPER, CARD = (16, 24, 46), (22, 33, 63)
    INK, INK_SOFT, INK_FAINT = (219, 229, 255), (165, 181, 224), (111, 128, 179)
    GRID, HL = (28, 40, 73), (107, 90, 18)
    RED, BLUE, GREEN, ORANGE, YELLOW = (255, 123, 115), (91, 140, 255), (79, 216, 164), (255, 170, 80), (255, 212, 59)
    ON_BLUE = (11, 20, 48)
    INK_DIM = (6, 10, 24)
else:
    PAPER, CARD = (251, 250, 244), (255, 255, 255)
    INK, INK_SOFT, INK_FAINT = (29, 59, 143), (74, 95, 153), (135, 150, 194)
    GRID, HL = (217, 226, 245), (255, 236, 153)
    RED, BLUE, GREEN, ORANGE, YELLOW = (242, 92, 84), (45, 107, 255), (18, 147, 106), (232, 128, 32), (255, 212, 59)
    ON_BLUE = (255, 255, 255)
    INK_DIM = (16, 36, 100)                  # scope overlay: deep pencil blue

FONT_DIR = Path(__file__).resolve().parent / "fonts"
_cache = {}


def _font(filename, size):
    key = (filename, size)
    if key not in _cache:
        try:
            _cache[key] = pygame.font.Font(str(FONT_DIR / filename), size)
        except Exception:                      # missing file: fall back to pygame's built-in font
            _cache[key] = pygame.font.Font(None, size)
    return _cache[key]


def title(size):
    """Headings: Gaegu Bold (hand-written)."""
    return _font("Gaegu-Bold.ttf", size)


def body(size):
    """Normal text: Patrick Hand."""
    return _font("PatrickHand-Regular.ttf", size)


def mono(size, bold=False):
    """Code: Courier Prime (true monospace, so per-character layout and the caret line up)."""
    return _font("CourierPrime-Bold.ttf" if bold else "CourierPrime-Regular.ttf", size)


def advance(font):
    """Width of one cell for a monospace font (integer advance from the font, not a rendered bounding box)."""
    try:
        return font.metrics("M")[0][4]
    except Exception:
        return font.size("M")[0]


def grid_surface(width, height, step=24, margin=None):
    """Graph-paper background (flat paper colour + thin grid lines + optional red margin line)."""
    surf = pygame.Surface((width, height))
    surf.fill(PAPER)
    for x in range(0, width, step):
        pygame.draw.line(surf, GRID, (x, 0), (x, height))
    for y in range(0, height, step):
        pygame.draw.line(surf, GRID, (0, y), (width, y))
    if margin is not None:
        pygame.draw.line(surf, RED, (margin, 0), (margin, height), 2)
    return surf


def _wobble(rect, seed, amount, step=14):
    """Points around a rectangle with a small, stable (seeded) hand-drawn jitter."""
    rnd = random.Random(seed)
    pts = []
    x0, y0, x1, y1 = rect.left, rect.top, rect.right, rect.bottom
    def edge(ax, ay, bx, by):
        n = max(2, int(max(abs(bx - ax), abs(by - ay)) // step))
        for i in range(n):
            t = i / n
            pts.append((ax + (bx - ax) * t + rnd.uniform(-amount, amount), ay + (by - ay) * t + rnd.uniform(-amount, amount)))
    edge(x0, y0, x1, y0)
    edge(x1, y0, x1, y1)
    edge(x1, y1, x0, y1)
    edge(x0, y1, x0, y0)
    return pts


def sketch_rect(surf, rect, color=None, width=2, seed=None, amount=1.4):
    """Hand-drawn outline: two slightly different wobbly passes, like a pencil box."""
    color = color or INK
    rect = pygame.Rect(rect)
    seed = seed if seed is not None else rect.x * 31 + rect.y * 17 + rect.w
    for k in range(2):
        pygame.draw.lines(surf, color, True, _wobble(rect, seed + k * 977, amount), width if k == 0 else max(1, width - 1))


def card(surf, rect, fill=None, border=None, shadow=True, width=2, seed=None, radius=10):
    """Paper card: hard offset shadow in ink, white fill, hand-drawn border."""
    rect = pygame.Rect(rect)
    if shadow:
        pygame.draw.rect(surf, border or INK, rect.move(3, 4), border_radius=radius)
    pygame.draw.rect(surf, fill or CARD, rect, border_radius=radius)
    sketch_rect(surf, rect, border or INK, width=width, seed=seed)


def pill(surf, rect, fill, border=None, shadow=True, radius=12, width=2):
    """Pencil button / label shape."""
    rect = pygame.Rect(rect)
    if shadow:
        pygame.draw.rect(surf, border or INK, rect.move(3, 4), border_radius=radius)
    pygame.draw.rect(surf, fill, rect, border_radius=radius)
    pygame.draw.rect(surf, border or INK, rect, width=width, border_radius=radius)


def text(surf, value, font, color, pos, anchor="center"):
    img = font.render(str(value), True, color)
    surf.blit(img, img.get_rect(**{anchor: (int(pos[0]), int(pos[1]))}))
    return img
