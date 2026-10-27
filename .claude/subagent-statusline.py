#!/usr/bin/env python3
"""Per-subagent status line: label, model, context occupancy.

Claude Code pipes {columns, tasks: [...]} on stdin and expects one NDJSON
line {"id", "content"} per task. The content REPLACES the whole row text,
so the label has to be re-emitted here.
"""
import json
import re
import sys

BAR_WIDTH = 10

RESET = "\033[0m"
MAGENTA = "\033[35m"
DIM = "\033[2;90m"
DARK = "\033[38;2;60;60;60m"
SEP = f"{DIM} · {RESET}"


def rgb(pct):
    """green(0,200,80) -> yellow(220,200,0) -> red(220,40,20)"""
    if pct <= 50:
        t = pct / 50
        r, g, b = 220 * t, 200, 80 - 80 * t
    else:
        t = (pct - 50) / 50
        r, g, b = 220, 200 - 160 * t, 20 * t
    return f"\033[38;2;{int(r)};{int(g)};{int(b)}m"


def emoji(pct):
    return "🚨" if pct >= 90 else "🔥" if pct >= 70 else "⚡" if pct >= 20 else "🟢"


def model_name(model):
    if not model:
        return None
    s = re.sub(r"-\d{8}$", "", str(model).replace("claude-", ""))
    wide = "[1m]" in s
    parts = s.replace("[1m]", "").split("-")
    name = " ".join([parts[0].capitalize(), ".".join(parts[1:])]).strip()
    return name + (" 1M" if wide else "")


def tokens(n):
    return f"{n / 1000:.1f}k" if n >= 1000 else str(n)


def bar(pct):
    filled = round(pct / 100 * BAR_WIDTH)
    blocks = [
        (rgb(i * 100 / (BAR_WIDTH - 1)) if i < filled else DARK) + "█"
        for i in range(BAR_WIDTH)
    ]
    return "".join(blocks) + RESET


def decorate(task, columns):
    right = []

    name = model_name(task.get("model"))
    if name:
        right.append(f"🤖 {MAGENTA}{name}{RESET}")

    used, size = task.get("tokenCount") or 0, task.get("contextWindowSize")
    if size and used:
        pct = min(100.0, used / size * 100)
        right.append(f"{bar(pct)} {emoji(pct)} {rgb(pct)}{pct:.0f}%{RESET} {DIM}{tokens(used)}{RESET}")
    elif used:
        right.append(f"{DIM}{tokens(used)}{RESET}")

    if not right:
        return None

    # Visible width of the right block: 12 for the model chunk is an estimate,
    # the bar chunk is fixed. Cheaper than stripping ANSI to measure.
    label = task.get("label") or task.get("description") or ""
    budget = max(10, columns - (len(name or "") + 3) - (BAR_WIDTH + 14) - 6)
    if len(label) > budget:
        label = label[: budget - 1] + "…"

    return SEP.join([label] + right) if label else SEP.join(right)


def main():
    payload = json.load(sys.stdin)
    columns = payload.get("columns") or 120
    for task in payload.get("tasks", []):
        content = decorate(task, columns)
        if content is not None:
            print(json.dumps({"id": task["id"], "content": content}))


if __name__ == "__main__":
    main()
