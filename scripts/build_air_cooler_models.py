"""Build original air cooler GLBs from official exterior dimensions and photographs.

X is cooler height, the CPU mounting face is at positive X, and the fans face +Z.
"""
from dataclasses import dataclass
from math import pi
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_fan_models import swept_blade
from build_product_models import Part, block, disc, empty, label, material, rim, save, tube


@dataclass(frozen=True)
class Cooler:
    id: str
    brand: str
    model: str
    height: float
    width: float
    depth: float
    tower_width: float
    tower_depth: float
    towers: tuple[float, ...]
    fans: tuple[float, ...]
    fan_size: int
    fin_count: int
    pipe_pairs: int
    fins_black: bool


COOLERS = [
    Cooler("deepcool-ak400", "DEEPCOOL", "AK400", 155, 127, 97, 127, 69, (-14,), (36,), 120, 46, 4, False),
    Cooler("thermalright-peerless-assassin-120-se", "THERMALRIGHT", "PA 120 SE", 155, 125, 135,
           125, 41, (-47, 19), (-14, 55), 120, 50, 6, False),
    Cooler("noctua-nh-d15-chromax-black", "NOCTUA", "NH-D15", 168, 150, 161,
           150, 49, (-56, 18), (-19, 67.5), 140, 44, 6, True),
]


def make_cooler(cooler):
    root = empty(cooler.model)
    root["provenance"] = "Authored approximation from manufacturer measurements and photographs"
    h = cooler.height / 2
    fin_material = material("stacked-aluminum-fins", (.10, .11, .13) if cooler.fins_black else (.45, .47, .49), .72, .44)
    cap = material("top-cover", (.034, .036, .043) if cooler.fins_black or cooler.brand == "DEEPCOOL" else (.30, .32, .35), .45, .38)
    pipe = material("heat-pipes", (.085, .086, .094) if cooler.fins_black else (.48, .31, .18), .84, .38)
    plate = material("mounting-base", (.18,.20,.24), .75, .4)
    clip = material("spring-steel", (.31,.33,.39), .65, .38)
    plastic = material("fan-frame", (.051,.053,.062), .10, .58)
    blade = material("fan-rotor", (.071,.074,.083), 0, .49)
    print_material = material("model-marking", (.60,.62,.67), .30, .52)
    structure = Part("fixed-heatsink", root)

    for z in cooler.towers:
        for i in range(cooler.fin_count):
            fraction = i / (cooler.fin_count - 1)
            x = -h + 4 + fraction * (cooler.height - 31)
            rail_depth = cooler.tower_depth - (2 if i % 2 else 0)
            width = cooler.tower_width if fraction < .82 else cooler.tower_width - 12
            block(structure(fin_material), (x, 0, z), (.64, width, rail_depth), 1.25, axis="x")
        block(structure(cap), (-h + 1.1, 0, z), (2.2, cooler.tower_width, cooler.tower_depth), 2.2, axis="x")
        label(structure(print_material), cooler.model, (-h - .02, -18, z - 2), (0,1,0), (0,0,1), 4.4, .37)
        for i in range(cooler.pipe_pairs):
            factor = (i + .5) / cooler.pipe_pairs
            y = (factor - .5) * (cooler.tower_width * .78)
            top = -h + 3.2 + (i % 2) * 1.45
            tube(structure(pipe), ((h - 12, y * .51, 0), (h - 15, y * .69, z * .42),
                                  (h - 23, y, z), (top, y, z)), 2.85, 12)

    block(structure(plate), (h - 3.6, 0, 0), (7.2, 46, 47), 2.5, axis="x")
    block(structure(plate), (h - 10, 0, 0), (5.8, 63, 21), 2.5, axis="x")
    empty("mount-cpu", (h, 0, 0), root)
    structure.finish()

    for index, z in enumerate(cooler.fans):
        # The frame and rotor have independent pivots at the centre of the mounting plane.
        fan_x = min(5, h - cooler.fan_size / 2 - 2)
        fan_root = empty(f"fan-frame-{index}", (fan_x, 0, z), root)
        stationary = Part("stationary", fan_root)
        radius = cooler.fan_size * .446
        w = cooler.fan_size / 2
        depth = min(25, 2 * (cooler.depth / 2 - abs(z)))
        edge = depth / 2
        rim(stationary(plastic), "z", 0, 0, 0, radius + .25, radius + 2.9, depth, 64)
        for x in (-w + 8, w - 8):
            for y in (-w + 8, w - 8):
                block(stationary(plastic), (x, y, 0), (16, 16, depth), 3)
                rim(stationary(clip), "z", x, y, edge - .12, 2.2, 4.1, .25, 20)
        for sign in (-1, 1):
            tube(stationary(clip), ((w * .1, sign * w, -edge + .9), (-w * .64, sign * w, -edge + 2),
                                   (-w * .69, sign * w, edge - .9), (-w * .81, sign * w * .94, edge - .9)), .84, 8)
        stationary.finish()

        spin = Part(f"rotor-{index}", fan_root)
        fan_blades = 7 if cooler.fan_size == 120 else 9
        disc(spin(blade), "z", 0, 0, 0, radius * .61, depth * .60, 45)
        for i in range(fan_blades):
            swept_blade(spin(blade), radius, fan_blades, i * 2 * pi / fan_blades)
        spin.finish()


if __name__ == "__main__":
    for cooler in COOLERS:
        save(cooler.id, lambda cooler=cooler: make_cooler(cooler), (-288, 226, 365), .29)
