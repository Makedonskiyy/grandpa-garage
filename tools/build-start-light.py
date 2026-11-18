"""
build-start-light — стартовый светофор («ёлка») для обкатки и заезда, пиксель-арт по скиллу pixel-art.

Выбор стиля (одной строкой, как просит скилл): вид спереди, тёмный тонированный контур,
14 цветов, свет сверху слева, точка = единица мира (как фоны сцен).

Корпус 20×64: сверху красная лампа (готовность и фальстарт), три жёлтых, внизу зелёная; над
каждой лампой — козырёк. В корпусе лампы погашены (тёмное тонированное стекло). Зажжённые
лампы — отдельные спрайты 8×8, их ставят поверх погашенных: координаты — в LAMPS.

Пишет текст спрайтов (источник правды) в art/source/start-light/*.txt; PNG рендерит
инструмент скилла: py -I .claude/skills/pixel-art/tools/grid.py render FILE.txt OUT --size WxH.
    npm run start-light
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "source" / "start-light"
OUT.mkdir(parents=True, exist_ok=True)

W, H = 20, 64
LAMP = 8
LAMP_X = 6
LAMP_Y = [6, 18, 28, 38, 50]  # красная, три жёлтых, зелёная (между группами — шире шаг)
KINDS = ["red", "amber", "amber", "amber", "green"]

PALETTE = {
    "o": "#121317",  # контур
    "b": "#2b2d33",  # корпус
    "l": "#3e414a",  # освещённая грань корпуса
    "s": "#1e2025",  # тень корпуса
    "h": "#08090b",  # козырёк и глубина под ним
    "r": "#4a1619",  # красное стекло погашено
    "a": "#4b3814",  # жёлтое погашено
    "g": "#123a20",  # зелёное погашено
    "q": "#6a2a2c",  # блик на погашенном красном
    "y": "#6b5426",  # блик на погашенном жёлтом
    "e": "#22553a",  # блик на погашенном зелёном
    "c": "#5a5e68",  # винты и кромка рамки
}
OFF = {"red": ("r", "q"), "amber": ("a", "y"), "green": ("g", "e")}
ON = {
    # ядро, середина, край, блик
    "red": ("#ffd2c6", "#ff3b30", "#b0161b", "#ffffff"),
    "amber": ("#fff0b8", "#ffb21f", "#c47b08", "#ffffff"),
    "green": ("#d8ffe2", "#36f26a", "#14a33f", "#ffffff"),
}

CIRCLE = [
    "..XXXX..",
    ".XXXXXX.",
    "XXXXXXXX",
    "XXXXXXXX",
    "XXXXXXXX",
    "XXXXXXXX",
    ".XXXXXX.",
    "..XXXX..",
]


def body():
    g = [["." for _ in range(W)] for _ in range(H)]
    # Корпус: скруглённый прямоугольник, левая грань светлее, правая в тени.
    for y in range(1, H - 1):
        for x in range(2, W - 2):
            corner = (y in (1, H - 2)) and (x in (2, W - 3))
            if corner:
                continue
            g[y][x] = "b"
        g[y][3] = "l" if 1 < y < H - 2 else g[y][3]
        g[y][W - 4] = "s" if 1 < y < H - 2 else g[y][W - 4]
    # Контур.
    for y in range(H):
        for x in range(W):
            if g[y][x] != ".":
                continue
            near = any(
                0 <= y + dy < H and 0 <= x + dx < W and g[y + dy][x + dx] not in (".", "o")
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))
            )
            if near:
                g[y][x] = "o"
    # Верхняя кромка светлее — свет сверху.
    for x in range(4, W - 4):
        g[2][x] = "l"
    # Лампы: тёмное кольцо-гнездо, погашенное стекло с бликом сверху слева, козырёк над лампой.
    for ly, kind in zip(LAMP_Y, KINDS):
        glass, hi = OFF[kind]
        for dy, row in enumerate(CIRCLE):
            for dx, ch in enumerate(row):
                if ch == "X":
                    g[ly + dy][LAMP_X + dx] = glass
        # гнездо: тёмный ободок по краю круга
        for dy, row in enumerate(CIRCLE):
            for dx, ch in enumerate(row):
                if ch != "X":
                    continue
                edge = any(
                    not (0 <= dy + ey < LAMP and 0 <= dx + ex < LAMP) or CIRCLE[dy + ey][dx + ex] != "X"
                    for ey, ex in ((0, 1), (0, -1), (1, 0), (-1, 0))
                )
                if edge:
                    g[ly + dy][LAMP_X + dx] = "h"
        g[ly + 2][LAMP_X + 2] = hi
        g[ly + 2][LAMP_X + 3] = hi
        g[ly + 3][LAMP_X + 2] = hi
        # козырёк: полоса над лампой, выступает на пиксель за корпус по бокам
        for x in range(LAMP_X - 1, LAMP_X + LAMP + 1):
            g[ly - 1][x] = "h"
        g[ly - 2][LAMP_X - 1] = "o"
        g[ly - 2][LAMP_X + LAMP] = "o"
        for x in range(LAMP_X, LAMP_X + LAMP):
            g[ly - 2][x] = "o"
    # Винты крепления сверху и снизу, разделитель между жёлтыми и зелёной.
    for (x, y) in ((4, 4), (W - 5, 4), (4, H - 5), (W - 5, H - 5)):
        g[y][x] = "c"
    for x in range(4, W - 4):
        g[47][x] = "s"
    return g


def lamp(kind):
    core, mid, edge, glint = ON[kind]
    pal = {"k": core, "m": mid, "e": edge, "w": glint}
    rows = []
    for dy, row in enumerate(CIRCLE):
        out = ""
        for dx, ch in enumerate(row):
            if ch != "X":
                out += "."
                continue
            d = ((dx - 3.5) ** 2 + (dy - 3.5) ** 2) ** 0.5
            ring = any(
                not (0 <= dy + ey < LAMP and 0 <= dx + ex < LAMP) or CIRCLE[dy + ey][dx + ex] != "X"
                for ey, ex in ((0, 1), (0, -1), (1, 0), (-1, 0))
            )
            out += "e" if ring else ("k" if d < 1.6 else "m")
        rows.append(out)
    # блик сверху слева
    rows[2] = rows[2][:2] + "w" + rows[2][3:]
    return pal, rows


def write(name, pal, rows):
    text = "\n".join(f"{k} = {v}" for k, v in pal.items()) + "\n---\n" + "\n".join(rows) + "\n"
    (OUT / f"{name}.txt").write_text(text, encoding="utf-8")


write("start_light", PALETTE, ["".join(r) for r in body()])
for kind in ("red", "amber", "green"):
    pal, rows = lamp(kind)
    write(f"start_lamp_{kind}", pal, rows)
(OUT / "layout.json").write_text(
    json.dumps({"size": [W, H], "lamp": LAMP, "lamps": [[LAMP_X, y, k] for y, k in zip(LAMP_Y, KINDS)]}),
    encoding="utf-8",
)
print("ok", OUT)
