"""Export product-specific original fan models in metres, with the face towards +Z."""
from dataclasses import dataclass
from math import cos, pi, sin
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_product_models import Part, block, disc, empty, material, rim, ring_housing, save, tube


@dataclass(frozen=True)
class Fan:
    id: str
    mark: str
    size: int
    depth: int
    blades: int
    radius: float
    color: tuple
    rotor: tuple
    corner: tuple
    lighting: str = ""
    brace_count: int = 4


FANS = [
    Fan("arctic-p12-pwm-pst", "ACFAN00120A", 120, 25, 5, 52.9,
        (.053, .054, .061), (.037, .039, .046), (.035, .035, .041)),
    Fan("arctic-p14-pwm-pst", "ACFAN00125A", 140, 27, 5, 61.9,
        (.048, .050, .058), (.041, .043, .051), (.032, .033, .041)),
    Fan("noctua-nf-a12x25-pwm", "NF-A12x25 PWM", 120, 25, 9, 54.8,
        (.67, .48, .32), (.26, .109, .065), (.19, .065, .040)),
    Fan("corsair-ar120-rgb", "CO-9050166-WW", 120, 25, 7, 53.9,
        (.045, .047, .052), (.81, .85, .88), (.019, .021, .028), "blades"),
    Fan("arctic-p12-pwm-pst-argb", "ACFAN00231A", 120, 25, 5, 52.6,
        (.053, .056, .067), (.79, .84, .90), (.03, .031, .037), "ring"),
]


def swept_blade(mesh, radius, count, angle):
    faces = [[], [], [], []]
    for index in range(12):
        proportion = index / 11
        radial = radius * (.30 + .7 * proportion)
        sweep = .88 * (1 - proportion) ** 1.65 - .12 * proportion
        chord = (2 * pi / count) * (.32 + .22 * sin(pi * proportion) - .15 * proportion)
        for side, (width, thickness) in enumerate(((0, -.62), (chord, -.62), (0, .62), (chord, .62))):
            a = angle + sweep + width
            pitch = -3.2 + 5.2 * proportion + (3.1 if side % 2 else 0)
            faces[side].append((radial * cos(a), radial * sin(a), pitch + thickness))
    for a, b in [(0, 1), (1, 3), (3, 2), (2, 0)]:
        for index in range(11):
            mesh.face((faces[a][index], faces[b][index], faces[b][index + 1], faces[a][index + 1]), True)
    mesh.face(tuple(faces[i][-1] for i in (0, 2, 3, 1)))


def make_fan(fan):
    root = empty(fan.mark)
    root["provenance"] = "Authored approximation from official product imagery and nominal dimensions"
    shell = material("injection-moulded-frame", fan.color, 0, .6)
    bumper = material("rubber-pads", fan.corner, 0, .79)
    label = material("matte-motor-cap", (.028, .029, .035), .02, .5)
    wire = material("wire-insulation", (.016, .019, .024), .05, .5)
    blade = material("rgb-emitter-diffused-rotor" if fan.lighting else "moulded-rotor", fan.rotor, 0, .45)
    frame = Part("stationary-frame", root)
    half = fan.size / 2
    edge = fan.depth / 2
    bore = fan.radius + .27
    ring_housing(frame(shell), "z", (0, 0), bore, (-half, half, -half, half), -edge, -edge + 3.1)
    ring_housing(frame(shell), "z", (0, 0), bore, (-half, half, -half, half), edge - 3.1, edge)
    rim(frame(shell), "z", 0, 0, 0, bore, bore + 2.2, fan.depth - 6, 64)
    hole_pitch = 52.5 if fan.size == 120 else 62.25
    for x in (-hole_pitch, hole_pitch):
        for y in (-hole_pitch, hole_pitch):
            block(frame(shell), (x, y, 0), (half - hole_pitch + 7.5, half - hole_pitch + 7.5, fan.depth - 4), 2.4)
            for end in (-1, 1):
                rim(frame(bumper), "z", x, y, end * (edge - .32), 2.45, 5.35, .64, 24)
            empty("mount-screw", (x, y, 0), root)
    disc(frame(shell), "z", 0, 0, -edge + 1.65, 37, 3.25, 44)
    for k in range(fan.brace_count):
        angle = 2 * pi * k / fan.brace_count + pi / 4
        points = [(r * cos(angle + twist), r * sin(angle + twist), -edge + 2.2)
                  for r, twist in ((16, 0), (35, -.08), (bore, -.06))]
        tube(frame(shell), points, 1.95, 8)
    tube(frame(wire), ((7, -12, -edge + 3.4), (25, -28, -edge + 3.4), (48, -47, -edge + 3.4)), .76, 7)
    frame.finish()

    rotor = Part("rotor-0", root)
    disc(rotor(blade), "z", 0, 0, 1.4, fan.radius * .63, fan.depth * .72, 55)
    disc(rotor(label), "z", 0, 0, fan.depth * .421, fan.radius * .49, .65, 52)
    for k in range(fan.blades):
        swept_blade(rotor(blade), fan.radius, fan.blades, 2 * pi * k / fan.blades)
    if fan.lighting == "ring":
        rim(rotor(blade), "z", 0, 0, 2.5, fan.radius - 2.1, fan.radius + .05, 4.9, 64)
    rotor.finish()


if __name__ == "__main__":
    for fan in FANS:
        save(fan.id, lambda fan=fan: make_fan(fan), (-98, 106, 212), fan.size * .00156)
