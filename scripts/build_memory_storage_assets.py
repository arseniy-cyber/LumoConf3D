"""Build original DIMM kit, M.2 SSD and SATA SSD visual approximations in Blender."""

from dataclasses import dataclass
from functools import partial
from math import cos, pi, sin
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_internal_models import STROKES
from build_product_models import Part, block, disc, empty, material, prism, rail, rim, rounded_outline, save

DIMM_LENGTH = 133.35
SLOT_SPACING = 21.2
SATA_IDENTIFIER = "samsung-870-evo-1tb"


@dataclass(frozen=True)
class MemoryDesign:
    identifier: str
    model: str
    profile: str
    generation: int
    length: float
    height: float
    thickness: float
    capacity_label: str
    speed: str


MEMORY = (
    MemoryDesign("corsair-vengeance-lpx-16-3200", "CMK16GX4M2B3200C16", "lpx", 4, 135, 33.53, 6.64, "8GB", "3200"),
    MemoryDesign("corsair-vengeance-lpx-32-3600", "CMK32GX4M2D3600C18", "lpx", 4, 135, 33.53, 6.64, "16GB", "3600"),
    MemoryDesign("kingston-fury-beast-ddr4-32-3200", "KF432C16BBK2/32", "fury", 4, 133.35, 34, 7.2, "16GB", "3200"),
    MemoryDesign("corsair-vengeance-ddr5-32-6000", "CMK32GX5M2B6000Z30", "vengeance", 5, 135, 35, 7, "16GB", "6000"),
    MemoryDesign("corsair-vengeance-rgb-ddr5-32-6000", "CMH32GX5M2B6000Z30K", "vengeance-rgb", 5, 135, 44, 8, "16GB", "6000"),
    MemoryDesign("kingston-fury-beast-ddr5-64-6000", "KF560C36BBEK2-64", "fury", 5, 133.35, 34.9, 6.62, "32GB", "6000"),
)

STROKES.update({
    "/": [[(.03,0),(.98,1)]],
    ".": [[(.47,0),(.53,0)]],
})


def polygon(points):
    """A CCW outline for the planar solid tool."""
    area = sum(a[0]*b[1] - b[0]*a[1] for a, b in zip(points, points[1:] + points[:1]))
    return points if area >= 0 else list(reversed(points))


def dimm_outline(points, height):
    return polygon([(height / 2 - rise, length) for length, rise in points])


def flat_label(mesh, axis, text, origin, horizontal, vertical, size, stroke):
    """Stencil-like lettering with a thin, bounded printed layer."""
    u, v, depth = origin
    for index, glyph in enumerate(text.upper()):
        for segment in STROKES.get(glyph, []):
            points = []
            for x, y in segment:
                across = (index*.87+x*.62)*size
                up = y*size
                points.append((u + across*horizontal[0] + up*vertical[0], v + across*horizontal[1] + up*vertical[1]))
            rail(mesh, axis, points, depth, stroke, .016)


def dimm_pcb(assembly, palette, design):
    height = design.height
    half = DIMM_LENGTH / 2
    notch = 3.75 if design.generation == 4 else -.32
    pcb_profile = [
        (-half + 1.0, 0), (notch - 1.28, 0), (notch - 1.1, 2.20), (notch-.64, 2.65),
        (notch+.64, 2.65), (notch + 1.1, 2.2), (notch + 1.28, 0), (half - 1.0, 0),
        (half, .96), (half, 5.6), (half-1.32, 5.6), (half-1.32, 8.1),
        (half, 8.1), (half, 11.3), (half-1.32, 11.3), (half-1.32, 13.0), (half, 13.0),
        (half, 24.0), (-half, 24.0), (-half, 13.0), (-half+1.32, 13.0), (-half+1.32,11.3),
        (-half,11.3), (-half, 8.1), (-half+1.32, 8.1), (-half+1.32, 5.6), (-half, 5.6),
        (-half,.96),
    ]
    prism(assembly(palette["laminate"]), "z", dimm_outline(pcb_profile, height), -.62, .62)
    for side in (-1, 1):
        for lane in range(144):
            y = (lane - 71.5) * .903
            if abs(y - notch) < 1.70:
                continue
            block(assembly(palette["contacts"]), (height / 2 - 1.3, y, side*.64), (2.52, .50, .054))
            if lane % 3 == 0:
                block(assembly(palette["copper"]), (height / 2 - 3.85, y, side*.64), (.58, .24, .047))
        for y in (-55, -43, -31, -19, 19, 31, 43, 55):
            block(assembly(palette["epoxy"]), (height / 2 - 12.0, y, side*.97), (9.6, 8.8, .72), 1.15)


def dimm_plates(assembly, palette, design):
    height = design.height
    length = design.length / 2
    side_gap = design.thickness / 2
    rgb = design.profile == "vengeance-rgb"

    if design.profile == "lpx":
        outline = [
            (-length, 26.8), (-length+3, 30.7), (-42, 30.7), (-36, 31.5),
            (36, 31.5), (42, 30.7), (length-3, 30.7), (length, 26.8),
            (length-1.65, 24), (length-1.85, 8.25), (44, 8.25), (37, 7.11),
            (-37, 7.11), (-44, 8.25), (-length+1.85, 8.25), (-length+1.65, 24),
        ]
    elif design.profile == "fury":
        outline = [
            (-length, 27.2), (-length+3.9, height), (-46, height), (-42, height-1.2),
            (24, height-1.2), (29, height), (length-4.2, height), (length, height-4.0),
            (length, 13.5), (length-1.9, 13.5), (length-1.9, 9.3), (62, 7.2),
            (49, 7.2), (47, 6.9), (9, 6.9), (-15, 7.9), (-62, 7.9),
            (-length+2.25, 10.4), (-length+2.25, 14.4), (-length, 14.4),
        ]
    else:
        edge = height-4.35 if rgb else height
        outline = [
            (-length, edge-4.2), (-length+4.3, edge-.7), (-48, edge), (-20, edge-.68),
            (20, edge-.68), (48, edge), (length-4.3, edge-.7), (length, edge-4.2),
            (length-1.65, 9.5), (length-4.25, 6.9), (39, 6.9), (30, 7.5),
            (-30, 7.5), (-39, 6.9), (-length+4.25, 6.9), (-length+1.65, 9.5),
        ]

    body = dimm_outline(outline, height)
    prism(assembly(palette["side"]), "z", body, -side_gap+.24, side_gap-.24)
    for side in (-1, 1):
        shell_from, shell_to = sorted([side*(side_gap-.52), side*(side_gap-.052)])
        refined = [(y*.985, height*.59 + (r-height*.59)*.965) for y, r in outline]
        prism(assembly(palette["shell"]), "z", dimm_outline(refined, height), shell_from, shell_to)
        customize_dimm_face(assembly, palette, design, side)

    if design.profile == "lpx":
        for pad_y in (-60,-54,-48,-42,-36,-30,-24,24,30,36,42,48,54,60):
            x = (height / 2 - 30.45 + -height / 2) / 2
            block(assembly(palette["side"]), (x,pad_y,0), (height-30.45, 3.65, design.thickness*.76), .52)
    if rgb:
        # Translucent cover with its own material so Three.js can drive its emission.
        diffuser = [
            (-65, height-4.85), (-67.35, height-2.55), (-63.4, height), (-23.2, height),
            (23.2,height), (63.4,height), (67.35,height-2.55), (65,height-4.85),
        ]
        prism(assembly(palette["diffuser"]), "z", dimm_outline(diffuser, height), -side_gap+.29, side_gap-.29)
        for side in (-1, 1):
            block(assembly(palette["rim"]), (height / 2 - height + 4.45, 0, side*(side_gap-.20)),
                  (.86,129,.32), .26)


def customize_dimm_face(assembly, palette, design, side):
    height = design.height
    z = side * (design.thickness/2 - .04)
    order = side

    def lettering(word, y, rise, size, ink, strokes=.24):
        depth = side*(design.thickness/2-.010)
        flat_label(assembly(ink), "z", word, (height/2-rise, order*y, depth), (0,order), (-1,0), size, strokes)

    if design.profile == "lpx":
        for pos in (-57,-51,-45,-39,-33,-27,27,33,39,45,51,57):
            block(assembly(palette["rim"]), (height / 2 - 17.5, pos, z), (18.1,.51,.055), .17)
        face = dimm_outline([(-23,29.6), (23,29.6), (18.2,19.4), (-18.2,19.4)], height)
        prism(assembly(palette["label"]), "z", face, *sorted([z, z + side*.018]))
        lettering("VENGEANCE", -16.8, 24.4, 4.38, palette["yellow"], .34)
        lettering("LPX", -4.4, 21.2, 2.85, palette["ink"])
        lettering("DDR4", -4.6, 16.0, 2.75, palette["ink"])
    elif design.profile == "fury":
        split = [(height/2-rise,y*order) for y,rise in [(-63,28),(-56,31),(-15,31),(10,11),(59,11)]]
        rail(assembly(palette["rim"]), "z", split, z, .78, .046)
        for index in range(11):
            y = (10 + index*3.8) * order
            rail(assembly(palette["rim"]), "z", [(height/2-13.4,y), (height/2-17.1,y+5.3*order)], z, .66, .046)
        lettering("FURY", -57, 17.0, 8.7, palette["ink"], .48)
        lettering("BEAST", 20, 22.3, 4.0, palette["ink"], .29)
        lettering(f"DDR{design.generation}", 47, 28.1, 2.8, palette["ink"], .22)
    else:
        high = 33.1 if design.profile == "vengeance-rgb" else 31.2
        low = high-12.7
        center = dimm_outline([(-29,high),(29,high),(24.2,low),(-24.2,low)], height)
        prism(assembly(palette["label"]), "z", center, *sorted([z, z + side*.018]))
        lettering("VENGEANCE", -17.1, low+4.7, 4.0, palette["ink"], .28)
        lettering("DDR5", -5, 9.7, 2.5, palette["ink"])
        for i in range(19):
            y = i * 2.08 + 25.3
            for row in range(5):
                rise = 9.75 + row * 2.18
                if y < 31 and row > 2:
                    continue
                for flank in (-1, 1):
                    x = height / 2 - rise
                    sign = flank*order
                    triangle = [(x-0.55, sign*(y+row%2)), (x+0.54, sign*(y-0.57+row%2)), (x+0.54, sign*(y+0.57+row%2))]
                    prism(assembly(palette["rim"]), "z", polygon(triangle), *sorted([z, z+side*.018]))
    if side == 1:
        badge_color = palette["white_label"]
        label_z = side*(design.thickness/2-.020)
        y = 44
        block(assembly(badge_color), (height/2-18.0, y, label_z), (5.8,31.0,.032), .49)
        flat_label(assembly(palette["epoxy"]), "z", f"{design.capacity_label} {design.speed}", (height/2-18.28, 30, label_z+.020),
                   (0,1), (-1,0), 2, .15)


def memory_kit(design):
    root = empty(design.model)
    root["provenance"] = "Original exterior approximation from manufacturer photos, dimensions and SKU drawings"
    root["moduleDimensionsMm"] = [design.height, design.length, design.thickness]
    root["slotCenterSpacingMm"] = SLOT_SPACING
    palette = {
        "laminate": material("dimm-black-laminate", (.025,.028,.034), .18,.61),
        "contacts": material("dimm-gold-fingers", (.68,.44,.16), .78,.37),
        "copper": material("dimm-test-point", (.35,.24,.105), .67,.50),
        "epoxy": material("dimm-chip-encapsulation", (.037,.044,.049), .10,.63),
        "side": material("dimm-anodized-side", (.062,.068,.078), .48,.46),
        "shell": material("dimm-anodized-spreader", (.035,.040,.047), .59,.46),
        "rim": material("dimm-machined-accents", (.104,.119,.137), .49,.52),
        "label": material("dimm-badge", (.082,.091,.102), .39,.44),
        "ink": material("dimm-printed-silver", (.66,.69,.72), .22,.48),
        "yellow": material("dimm-printed-yellow", (.82,.58,.076), .12,.46),
        "white_label": material("dimm-serial-paper", (.74,.75,.77), .08,.63),
        "diffuser": material("rgb-emitter", (.59,.68,.84), .03,.40),
    }
    shader = palette["diffuser"].node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (.26,.47,1.0,1)
    shader.inputs["Emission Strength"].default_value = .38
    for index in range(2):
        z = (index-.5)*SLOT_SPACING
        assembly = Part(f"dimm-{index+1}", root, (0,0,z))
        dimm_pcb(assembly, palette, design)
        dimm_plates(assembly, palette, design)
        assembly.finish()
        empty(f"mount-dimm-{index+1}", (design.height / 2, 0, z), root)
    return root


@dataclass(frozen=True)
class SsdDesign:
    identifier: str
    model: str
    brand: str
    series: str
    thickness: float
    board_color: tuple[float, float, float]
    label_color: tuple[float, float, float]


STORAGE = (
    SsdDesign("kingston-nv2-1tb", "SNV2S/1000G", "KINGSTON", "NV2", 2.2, (.028,.096,.238), (.82,.85,.88)),
    SsdDesign("kingston-kc3000-1tb", "SKC3000S/1024G", "KINGSTON", "KC3000", 2.21, (.017,.020,.026), (.030,.034,.041)),
    SsdDesign("crucial-t500-2tb", "CT2000T500SSD8", "CRUCIAL", "T500", 2.30, (.019,.027,.042), (.034,.033,.040)),
)


def m2_board(assembly, design, palette):
    panel = palette["pcb"]
    pad = palette["gold"]
    x_max = design.thickness / 2 - .07
    pcb_front = x_max - .81
    shoulder = (-10.1,-40)
    notch = [(-2.55*cos(angle*pi/24), -40 + 2.55*sin(angle*pi/24)) for angle in range(25)]
    profile = [shoulder, *notch, (10.1,-40), (11,-39.1), (11,35.0), (10.35,35.0),
        (10.35,39.62),(9.95,40),(8.55,40),(8.30,39.5),(8.30,34.6),(6.60,34.6),
        (6.60,39.50),(6.12,40),(-10.0,40),(-11,38.8),(-11,-39.1)]
    prism(assembly(panel), "x", polygon(profile), pcb_front, x_max)
    for y in [index*.50-10.2 for index in range(42)]:
        if 6.13 < y < 8.42:
            continue
        for x in [pcb_front-.024, x_max+.024]:
            block(assembly(pad), (x,y,38.13), (.038,.29,3.65), .075, "x")
    for edge in (pcb_front-.020, x_max+.028):
        rail(assembly(pad), "x",
             [(-2.9*cos(idx*pi/24), -40+2.9*sin(idx*pi/24)) for idx in range(25)],
             edge, .64, .055)
    for y in (-9.2, -8.2, 8.2, 9.2):
        for idx in range(19):
            z = -34.4 + idx*3.83
            if (idx+round(y)) % 7 == 0:
                continue
            block(assembly(pad), (pcb_front-.042,y,z), (.043,.40,1.03), .10, "x")
            if (idx+round(y)) % 2 == 0:
                block(assembly(palette["smd"]), (pcb_front-.244,y,z), (.42,.34,.68), .13, "x")


def m2_spreader(assembly, design, palette):
    face_x = -design.thickness / 2
    for length, width, z in [(12.5, 12.5, -24.0), (13.1, 12.2, -8.65), (4.85, 7.2, 2.8), (12.2, 12.1, 17.0)]:
        block(assembly(palette["package"]), (face_x+.465, .2, z), (.87,width,length), .55, "x")
    block(assembly(palette["label"]), (face_x+.05, 0, -2.0), (.082,18.05,65.95), .73, "x")

    def ink(text, center_y, z, size, stroke, tint=None):
        color = tint or palette["printed"]
        flat_label(assembly(color), "x", text, (center_y,z,face_x+.004), (0,1), (1,0), size, stroke)

    if design.series == "NV2":
        ink("KINGSTON", 4.35, -31.1, 2.9, .22)
        disc(assembly(palette["accent"]),"x",5.4,-9.5,face_x+.024,1.95,.028,16)
        ink("NV2", -.15, -30.9, 4.0, .24)
        ink("1000GB", 3.4, 12.7, 2.55, .19)
        ink("PCIe 4.0", -5.4, -30.6, 2.35, .17)
        for i in range(24):
            if (i%5) not in (2,4):
                block(assembly(palette["printed"]), (face_x+.031,-3.7,1.6+i*.76), (.032,4.0,.21))
    elif design.series == "KC3000":
        ink("KC3000", -.95, -31.5, 4.95, .28)
        ink("PCIE 4.0 NVME M.2", -4.9, -31.3, 1.7, .135)
        for n in range(4):
            start=-6.8+n*2.1
            path=[(start,-4.1+n*.85), (start,-.1+n*2.55), (start+7.0,10.5+n*1.68), (start+7,25.3+n*.61)]
            rail(assembly(palette["printed"]),"x",path,face_x+.026,.18,.034)
        ink("KINGSTON", -6.0, 11.7, 2.62, .18)
    else:
        ink("CRUCIAL", -1.19, -30.8, 4.25, .28)
        ink("MICRON", -4.1, -30.6, 1.7, .14)
        ink("T500", -.72, 12.3, 3.44, .26)
        ink("PCIE 4.0 NVME", -4.5, 8.5, 1.42, .12)


def storage_module(design):
    root = empty(design.model)
    root["provenance"] = "Original exterior approximation. The chip positions, traces and label typesetting are illustrative."
    root["physicalDimensionsMm"] = [design.thickness, 22, 80]
    assembly = Part("m2-2280-module", root)
    palette = {
        "pcb": material("m2-laminate", design.board_color, .22,.55),
        "gold": material("m2-gold-plating", (.70,.50,.19), .71,.35),
        "smd": material("m2-smd-components", (.20,.16,.085), .16,.51),
        "package": material("m2-chip-package", (.036,.042,.047), .10,.58),
        "label": material("m2-label-surface", design.label_color, .12,.49),
        "printed": material("m2-original-wordmark-geometry", (.095,.126,.17) if design.series == "NV2" else (.66,.70,.74), .22,.55),
        "accent": material("m2-series-accent", (.11,.43,.70), .15,.48),
    }
    m2_board(assembly, design, palette)
    m2_spreader(assembly, design, palette)
    assembly.finish()
    empty("mount-m2-post", (0,0,-40), root)
    empty("mount-m2-edge", (0,0,38.67), root)
    return root


def samsung_sata():
    root = empty("MZ-77E1T0B-AM")
    root["provenance"] = "Original visual approximation of Samsung SSD 870 EVO 1 TB SATA"
    root["physicalDimensionsMm"] = [6.8, 69.85, 100]
    enclosure = Part("two-piece-2_5-inch-enclosure", root)
    main = material("sata-anodized-shell", (.021,.025,.032), .56,.48)
    bevel = material("sata-anodized-edge", (.063,.070,.080), .63,.46)
    seam = material("sata-outer-wall", (.015,.017,.019), .34,.53)
    mark = material("sata-front-silk", (.67,.71,.75), .17,.49)
    gray = material("sata-front-square", (.33,.36,.39), .28,.60)
    rear_label = material("sata-product-rear-label", (.024,.021,.023), .12,.56)
    orange = material("sata-evo-silk", (.87,.35,.062), .12,.49)
    steel = material("sata-screw-steel", (.38,.43,.47), .71,.39)
    recess = material("sata-connector-insulator", (.029,.029,.031), .16,.65)
    gold = material("sata-plated-terminal", (.72,.51,.23), .71,.38)

    prism(enclosure(main), "x", rounded_outline(69.07,99.25,3.35), -3.4,-2.75)
    prism(enclosure(bevel), "x", rounded_outline(69.85,100,3.45), -2.78,-1.73)
    prism(enclosure(main), "x", rounded_outline(69.15,99.32,3.40), 2.71,3.4)
    prism(enclosure(bevel), "x", rounded_outline(69.85,100,3.53), 1.72,2.71)
    wall_outline = [
        (-33.9,-49.35),(32.8,-49.35),(34.55,-47.35),(34.55,47.40),(32.2,49.4),
        (18.15,49.4),(18.15,44.35),(-22.25,44.35),(-22.25,49.4),(-32.45,49.4),
        (-34.55,47.35),(-34.55,-47.35),
    ]
    prism(enclosure(seam), "x", polygon(wall_outline), -1.72,1.72)

    # Recessed tongues and keyed ends at the cable-entry side.
    connectors = Part("sata-connector-bay", root)
    block(connectors(recess), (.1,-2.10,43.95),(3.26,40.40,3.4),.52,"z")
    for name, center, length, contacts in [("sata-power", -12.2, 20.55, 15), ("sata-data", 7.13, 10.8, 7)]:
        left = center-length/2
        block(connectors(recess), (.21,center,47.12),(.89,length,5.58),.21,"z")
        block(connectors(recess), (-.32,left+.55,47.28),(1.82,1.1,5.10),.15,"z")
        for index in range(contacts):
            y = center + (index - (contacts-1)/2) * (length-2.8) / contacts
            block(connectors(gold), (.679,y,47.72),(.046,.59,2.88),.06,"x")
        empty(f"mount-{name}", (.20,center,49.4), root)
    connectors.finish()

    # Face lettering and the small inlay are printed geometry.
    flat_label(enclosure(mark), "x", "SAMSUNG", (1.85,-15.0,-3.41),(0,1),(1,0), 5.10,.42)
    flat_label(enclosure(gray), "x", "SOLID STATE DRIVE", (-1.48,-15.0,-3.41),(0,1),(1,0), 2.05,.19)
    block(enclosure(gray),(-3.408,-26.0,.0),(.012,10.12,10.12),.15,"x")
    prism(enclosure(gray), "x", polygon([(1.0,45.4),(-1.25,45.4),(-.125,46.96)]), -3.412,-3.402)

    # Back label and recessed 2.5-inch mounting holes.
    block(enclosure(rear_label),(3.411,0,0),(.024,49.30,70.08),1.80,"x")
    flat_label(enclosure(mark), "x", "870", (16.6,-30.3,3.431),(0,1),(1,0), 4.45,.31)
    flat_label(enclosure(orange), "x", "EVO", (16.6,-17.8,3.431),(0,1),(1,0), 4.45,.31)
    flat_label(enclosure(mark), "x", "1TB", (16.6,11.6,3.431),(0,1),(1,0), 4.43,.31)
    flat_label(enclosure(mark), "x", "SATA 6GB/S", (11.9,-30.3,3.431),(0,1),(1,0), 2.40,.16)
    block(enclosure(orange),(3.43,10.65,-.43),(.014,.21,65.2))
    flat_label(enclosure(mark), "x", "MZ-77E1T0B/AM", (-12.1,-29.5,3.431),(0,1),(1,0), 1.85,.13)
    for offset in range(4):
        width = 56.0 - offset*4.6
        block(enclosure(gray),(3.43,-15.65-offset*1.65,-30.4+width/2),(.013,.19,width))
    for y in (-30.55,30.55):
        for z in (-36.6,39.8):
            rim(enclosure(steel), "x", y,z,3.368,1.14,1.92,.052,14)
            disc(enclosure(seam),"x",y,z,3.395,2.29,.025,14)
            rim(enclosure(steel), "y", z,0,y/.875, .87,1.28,.023,12)
    enclosure.finish()
    return root


if __name__ == "__main__":
    user_args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    subset = {arg for arg in user_args if arg != "--render"}
    for design in MEMORY:
        if not subset or design.identifier in subset:
            save(design.identifier, partial(memory_kit, design), (-75,-36,122), .166)
    for design in STORAGE:
        if not subset or design.identifier in subset:
            save(design.identifier, partial(storage_module, design), (-192,50,68), .096)
    if not subset or SATA_IDENTIFIER in subset:
        save(SATA_IDENTIFIER, samsung_sata, (-148,59,90), .139)
