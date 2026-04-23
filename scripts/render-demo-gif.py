#!/usr/bin/env python3

from __future__ import annotations

from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_TRANSCRIPT = ROOT_DIR / "docs/assets/gohan-control-plane-probe-bridge-demo.txt"
DEFAULT_OUTPUT = ROOT_DIR / "docs/assets/gohan-control-plane-probe-bridge-demo.gif"

WIDTH = 1100
HEIGHT = 760
CARD_X = 68
CARD_Y = 132
CARD_W = WIDTH - CARD_X * 2
CARD_H = HEIGHT - 164
HEADER_H = 64
BODY_PADDING_X = 34
BODY_PADDING_Y = 30
VISIBLE_LINES = 16


def load_font(size: int, *, mono: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    mono_candidates = [
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Courier.ttc",
    ]
    sans_candidates = [
        "/System/Library/Fonts/Avenir Next.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/System/Library/Fonts/SFNS.ttf",
    ]
    candidates = mono_candidates if mono else sans_candidates
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size=size)
    return ImageFont.load_default()


TITLE_FONT = load_font(36)
SUBTITLE_FONT = load_font(20)
LABEL_FONT = load_font(16)
CODE_FONT = load_font(24, mono=True)
CODE_FONT_SMALL = load_font(22, mono=True)


def read_transcript(path: Path) -> list[str]:
    return [line.rstrip("\n") for line in path.read_text(encoding="utf-8").splitlines()]


def milestone_indices(lines: list[str]) -> list[int]:
    indices: list[int] = []
    for index, line in enumerate(lines):
        if line.startswith("==>") or line.startswith("Joint demo completed successfully."):
            indices.append(index)

    if lines:
        indices.append(len(lines) - 1)

    deduped: list[int] = []
    for index in indices:
        if deduped and deduped[-1] == index:
            continue
        deduped.append(index)
    return deduped


def frame_durations(lines: list[str], indices: list[int]) -> list[int]:
    durations: list[int] = []
    for index in indices:
        line = lines[index]
        if line.startswith("==>"):
            durations.append(520)
        elif "workflow_state=COMPLETED" in line:
            durations.append(900)
        elif line.startswith("Joint demo completed successfully."):
            durations.append(1500)
        else:
            durations.append(420)
    return durations


def draw_gradient_background(image: Image.Image) -> None:
    pixels = image.load()
    for y in range(image.height):
        t = y / max(1, image.height - 1)
        r = int(247 + (227 - 247) * t)
        g = int(242 + (235 - 242) * t)
        b = int(232 + (228 - 232) * t)
        for x in range(image.width):
            pixels[x, y] = (r, g, b)

    draw = ImageDraw.Draw(image, "RGBA")
    draw.ellipse((40, 10, 340, 310), fill=(213, 232, 219, 160))
    draw.ellipse((760, 40, 1080, 300), fill=(247, 214, 175, 140))
    draw.ellipse((730, 520, 1080, 820), fill=(203, 219, 235, 130))


def round_rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def line_style(line: str, *, highlighted: bool) -> tuple[tuple[int, int, int], ImageFont.FreeTypeFont | ImageFont.ImageFont]:
    if line.startswith("==>"):
        return ((255, 182, 93) if highlighted else (240, 172, 91), CODE_FONT)
    if line.startswith("task_id=") or line.startswith("approval_id=") or line.startswith("probe_session_id="):
        return ((131, 197, 255), CODE_FONT_SMALL)
    if line.startswith("last_heartbeat="):
        return ((167, 201, 255), CODE_FONT_SMALL)
    if line.startswith("workflow_state=COMPLETED"):
        return ((126, 231, 135), CODE_FONT)
    if line.startswith("task_result="):
        return ((235, 237, 241), CODE_FONT_SMALL)
    if line.startswith("control_plane_log=") or line.startswith("probe_log="):
        return ((180, 214, 255), CODE_FONT_SMALL)
    if line.startswith("Joint demo completed successfully."):
        return ((126, 231, 135), CODE_FONT)
    return ((222, 226, 234), CODE_FONT_SMALL)


def draw_terminal_frame(lines: list[str], current_index: int) -> Image.Image:
    image = Image.new("RGB", (WIDTH, HEIGHT), (246, 241, 233))
    draw_gradient_background(image)
    draw = ImageDraw.Draw(image, "RGBA")

    draw.text((CARD_X, 38), "Gohan Joint Demo", font=TITLE_FONT, fill=(23, 29, 37))
    draw.text(
        (CARD_X, 82),
        "Control plane + probe bridge + raw session event ingestion",
        font=SUBTITLE_FONT,
        fill=(70, 79, 92),
    )

    chip_text = "5-minute preview"
    chip_bbox = draw.textbbox((0, 0), chip_text, font=LABEL_FONT)
    chip_w = chip_bbox[2] - chip_bbox[0] + 28
    chip_h = chip_bbox[3] - chip_bbox[1] + 18
    chip_box = (WIDTH - CARD_X - chip_w, 44, WIDTH - CARD_X, 44 + chip_h)
    round_rect(draw, chip_box, 18, fill=(255, 245, 220), outline=(214, 184, 123), width=2)
    draw.text((chip_box[0] + 14, chip_box[1] + 8), chip_text, font=LABEL_FONT, fill=(120, 84, 27))

    shadow_box = (CARD_X + 10, CARD_Y + 14, CARD_X + CARD_W + 10, CARD_Y + CARD_H + 14)
    round_rect(draw, shadow_box, 28, fill=(18, 25, 34, 28))
    round_rect(draw, (CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + CARD_H), 28, fill=(13, 18, 27))
    round_rect(
        draw,
        (CARD_X, CARD_Y, CARD_X + CARD_W, CARD_Y + HEADER_H),
        28,
        fill=(20, 27, 39),
    )
    draw.rectangle((CARD_X, CARD_Y + HEADER_H - 12, CARD_X + CARD_W, CARD_Y + HEADER_H), fill=(20, 27, 39))

    dot_y = CARD_Y + 26
    for offset, color in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        x = CARD_X + 24 + offset * 22
        draw.ellipse((x, dot_y, x + 12, dot_y + 12), fill=color)

    draw.text((CARD_X + 96, CARD_Y + 21), "joint-demo.sh", font=LABEL_FONT, fill=(186, 196, 210))
    draw.text((CARD_X + CARD_W - 244, CARD_Y + 21), "runtime demo transcript", font=LABEL_FONT, fill=(120, 132, 149))

    start = max(0, current_index - VISIBLE_LINES + 1)
    visible = lines[start : current_index + 1]

    line_height = 31
    body_x = CARD_X + BODY_PADDING_X
    body_y = CARD_Y + HEADER_H + BODY_PADDING_Y
    highlight_index = len(visible) - 1
    cursor_y = body_y + highlight_index * line_height
    round_rect(
        draw,
        (body_x - 12, cursor_y - 6, CARD_X + CARD_W - BODY_PADDING_X + 10, cursor_y + line_height + 4),
        14,
        fill=(24, 44, 69),
    )

    for idx, line in enumerate(visible):
        y = body_y + idx * line_height
        if idx == highlight_index:
            draw.text((body_x - 18, y), ">", font=CODE_FONT_SMALL, fill=(88, 179, 255))

        fill, font = line_style(line, highlighted=idx == highlight_index)
        draw.text((body_x, y), line, font=font, fill=fill)

    footer_text = "heartbeat  ->  raw batch ingest  ->  approval  ->  completion"
    footer_bbox = draw.textbbox((0, 0), footer_text, font=LABEL_FONT)
    footer_w = footer_bbox[2] - footer_bbox[0]
    draw.text(
        (CARD_X + CARD_W - footer_w - 28, CARD_Y + CARD_H - 34),
        footer_text,
        font=LABEL_FONT,
        fill=(105, 121, 145),
    )

    return image


def save_gif(frames: Iterable[Image.Image], durations: list[int], output_path: Path) -> None:
    frame_list = list(frames)
    if not frame_list:
        raise ValueError("No frames to save")

    optimized = []
    for frame in frame_list:
        optimized.append(frame.convert("P", palette=Image.ADAPTIVE, colors=128))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    optimized[0].save(
        output_path,
        save_all=True,
        append_images=optimized[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )


def main() -> None:
    transcript_path = DEFAULT_TRANSCRIPT
    output_path = DEFAULT_OUTPUT

    lines = read_transcript(transcript_path)
    indices = milestone_indices(lines)
    durations = frame_durations(lines, indices)
    frames = [draw_terminal_frame(lines, index) for index in indices]
    save_gif(frames, durations, output_path)

    print(f"transcript={transcript_path}")
    print(f"output={output_path}")
    print(f"frames={len(frames)}")


if __name__ == "__main__":
    main()
