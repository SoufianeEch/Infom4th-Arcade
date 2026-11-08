"""Tiny helper that lets a pygame game talk to the InfoM4th Arcade hub when it runs in the browser (pygbag).

On the desktop every function is a harmless no-op, so a game can call them unconditionally.
Source of truth: shared/python/arcade_web.py  (scripts/build-python-games.sh copies it into each game's src/).
"""
import json
import sys

WEB = sys.platform == "emscripten"
if WEB:
    from platform import window
else:
    window = None


def js(code):
    """Run a line of JavaScript in the browser; no-op on the desktop."""
    if WEB:
        try:
            window.eval(code)
        except Exception:
            pass


def report_score(score):
    """Final score of a run -> the hub saves it to the shared leaderboard under the player's name."""
    if score and score > 0:
        js("window.parent!==window&&window.parent.postMessage("
           "{type:'arcade:score',value:%d,label:'points'},location.origin)" % int(score))


def exit_to_arcade():
    """Ask the hub to go back to the game menu (a browser tab cannot 'quit')."""
    js("window.parent!==window&&window.parent.postMessage({type:'arcade:exit'},location.origin)")


def store_get(key, default=None):
    """Read a JSON value from browser localStorage (web only; returns default on the desktop)."""
    if not WEB:
        return default
    try:
        raw = window.localStorage.getItem(key)
        return default if raw is None else json.loads(str(raw))
    except Exception:
        return default


def store_set(key, value):
    if not WEB:
        return
    try:
        window.localStorage.setItem(key, json.dumps(value))
    except Exception:
        pass


def prefers_dark():
    """True when the system/browser prefers a dark colour scheme (desktop: dark unless ARCADE_THEME=light)."""
    if WEB:
        try:
            return bool(window.matchMedia("(prefers-color-scheme: dark)").matches)
        except Exception:
            return True
    import os
    return os.environ.get("ARCADE_THEME", "dark").lower() != "light"


def is_touch():
    """True on touch screens (phones, tablets): games use it to show on-screen buttons. Desktop: always False."""
    if not WEB:
        return False
    try:
        return bool(window.matchMedia("(pointer: coarse)").matches)
    except Exception:
        return False
