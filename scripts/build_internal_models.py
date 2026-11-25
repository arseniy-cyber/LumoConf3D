"""Rebuild original processor package, NVMe SSD and PSU approximations."""

from functools import partial
from math import cos, pi, sin
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_product_models import (Part, STROKES, block, disc, empty, label, material, perforations,
                                  prism, rail, rim, rounded_outline, save, tapered_blade)

STROKES.update({
    "0": [[(.15,0),(0,.15),(0,.85),(.15,1),(.85,1),(1,.85),(1,.15),(.85,0),(.15,0)],[(.17,.15),(.83,.85)]],
    "1": [[(.23,.76),(.50,1),(.50,0)],[(.16,0),(.85,0)]],
    "2": [[(0,.84),(.2,1),(.8,1),(1,.84),(1,.63),(0,.16),(0,0),(1,0)]],
    "3": [[(0,1),(1,1),(.6,.55),(1,.43),(1,.17),(.8,0),(.17,0),(0,.14)]],
    "6": [[(.89,.94),(.74,1),(.27,1),(0,.72),(0,.18),(.2,0),(.82,0),(1,.18),(1,.43),(.83,.59),(0,.59)]],
    "7": [[(0,1),(1,1),(.28,0)]],
    "8": [[(.15,.52),(0,.67),(0,.84),(.15,1),(.85,1),(1,.84),(1,.67),(.85,.52),(.15,.52),
          (0,.38),(0,.15),(.15,0),(.85,0),(1,.15),(1,.38),(.85,.52)]],
    "9": [[(.06,.1),(.2,0),(.72,0),(1,.25),(1,.84),(.82,1),(.18,1),(0,.82),(0,.59),(.17,.43),(1,.43)]],
    "-": [[(.12,.49),(.89,.49)]],
    "B": [[(0,0),(0,1),(.73,1),(1,.84),(1,.65),(.72,.50),(0,.50)],[(.72,.50),(1,.35),(1,.15),(.73,0),(0,0)]],
    "D": [[(0,0),(0,1),(.72,1),(1,.76),(1,.24),(.72,0),(0,0)]],
    "I": [[(.10,1),(.90,1)],[(.50,1),(.50,0)],[(.1,0),(.9,0)]],
    "K": [[(0,0),(0,1)],[(1,1),(0,.47),(1,0)]],
    "M": [[(0,0),(0,1),(.50,.46),(1,1),(1,0)]],
    "N": [[(0,0),(0,1),(1,0),(1,1)]],
    "P": [[(0,0),(0,1),(.8,1),(1,.82),(1,.65),(.8,.47),(0,.47)]],
    "V": [[(0,1),(.50,0),(1,1)]],
    "Y": [[(0,1),(.5,.52),(1,1)],[(.5,.52),(.5,0)]],
    "Z": [[(0,1),(1,1),(0,0),(1,0)]],
})

PROCESSORS = {
    "intel-core-i5-12400f": ("LGA1700", "I5-12400F"),
    "intel-core-i5-13400f": ("LGA1700", "I5-13400F"),
    "intel-core-i5-13600k": ("LGA1700", "I5-13600K"),
    "intel-core-i7-14700k": ("LGA1700", "I7-14700K"),
    "amd-ryzen-5-5600": ("AM4", "5600"),
    "amd-ryzen-7-5700x": ("AM4", "5700X"),
    "amd-ryzen-5-7600": ("AM5", "7600"),
    "amd-ryzen-7-7700x": ("AM5", "7700X"),
    "amd-ryzen-7-7800x3d": ("AM5", "7800X3D"),
    "amd-ryzen-7-9800x3d": ("AM5", "9800X3D"),
}


def processor_package(socket, name):
    group = empty(name)
    group["provenance"] = "Original visual package approximation. Contact pattern is illustrative."
    part = Part("package", group)
    laminate = material("package-substrate", (.025, .083, .073) if socket == "AM5" else (.036, .061, .029), .30, .47)
    nickel = material("ihs-machined-nickel", (.44, .46, .48), .75, .37)
    polished = material("ihs-edge-nickel", (.52, .55, .57), .84, .26)
    etching = material("laser-etch", (.069, .073, .078), .5, .56)
    contact = material("gold-contact", (.65, .43, .13), .73, .35)
    locator = material("pin-1-mark", (.82, .46, .127), .73, .35)
    dielectric = material("dielectric-capacitor", (.26, .23, .19), .18, .55)

    height, length = (37.5, 45) if socket == "LGA1700" else (40,40)
    block(part(laminate),(0.55,0,0),(1.36,height,length),.6,"x")
    prism(part(locator), "x", [(height/2-.6,length/2-4.4),(height/2-.6,length/2-.55),
                               (height/2-4.4,length/2-.55)], -.20,-.14)
    if socket == "AM5":
        # Eight stepped arms on AM5's machined heat spreader expose the SMD banks.
        profile = [
            (-17,-11),(-12,-11),(-12,-16),(-5,-16),(-5,-12),(5,-12),(5,-16),(12,-16),(12,-11),
            (17,-11),(17,-7),(13,-7),(13,7),(17,7),(17,11),(12,11),(12,16),(5,16),(5,12),
            (-5,12),(-5,16),(-12,16),(-12,11),(-17,11),(-17,7),(-13,7),(-13,-7),(-17,-7),
        ]
        prism(part(polished), "x", profile, -.72,-.09)
        inner = [(u*.962,v*.962) for u,v in profile]
        prism(part(nickel), "x", inner, -2.39,-.72)
        for u in (-14.6,14.6):
            for v in (-17.98,17.98):
                for n in range(5):
                    for m in range(2):
                        block(part(contact), (-.19,u+m*.62,v+n*.82-1.64),(.08,.45,.70),.06,"x")
                        block(part(dielectric), (-.35,u+m*.62,v+n*.82-1.64),(.27,.30,.37),.04,"x")
    else:
        h, d = (31.6,38.6) if socket == "LGA1700" else (35.7,35.8)
        if socket == "LGA1700":
            profile = [(-h/2+2,-d/2),(h/2-2,-d/2),(h/2,-d/2+2),(h/2,d/2-4),
                       (h/2-2,d/2),(6,d/2),(4,d/2-1.3),(-4,d/2-1.3),(-6,d/2),
                       (-h/2+2,d/2),(-h/2,d/2-2),(-h/2,-d/2+2)]
        else:
            profile = rounded_outline(h,d,1.75)
        prism(part(polished), "x", profile, -.72,-.09)
        prism(part(nickel), "x", [(u*.966,v*.966) for u,v in profile], -2.39,-.72)

    mark = "RYZEN" if socket.startswith("AM") else "INTEL CORE"
    face = -2.42
    mark_size = 4.1 if socket.startswith("AM") else 3.38
    origin = -.42 * mark_size * len(mark)
    label(part(etching), mark, (face,1.9,origin), (0,0,1), (0,1,0), mark_size, .20)
    label(part(etching), name, (face,-4.8,-.84*len(name)), (0,0,1), (0,1,0), 2.0, .14)
    for n in range(10):
        if n % 3 != 2:
            block(part(etching), (face,-8.1, -5.2+n*1.05),(.05,.47,.69),0,"x")

    contact_side = Part("terminal-field", group)
    if socket == "AM4":
        for i in range(34):
            for j in range(34):
                y, z = i * 1.05 - 17.32, j * 1.05 - 17.32
                if (abs(y) < 5 and abs(z) < 5) or (y > 16 and z < -14) or (y < -15 and z > 15):
                    continue
                disc(contact_side(contact), "x", y,z,2.17,.36,1.89, 5)
    else:
        rows = 37
        cols = 43 if socket == "LGA1700" else 39
        for i in range(rows):
            for j in range(cols):
                y = (i - (rows - 1) / 2) * (height - 4) / rows
                z = (j - (cols - 1) / 2) * (length - 4) / cols
                if (abs(y) < 5.1 and abs(z) < 8.9) or (abs(y) > 16.5 and abs(z) > 16 and j % 2 == 0):
                    continue
                block(contact_side(contact),(1.26,y,z),(.05,.50,.58),0,"x")
        for i in range(8):
            for j in range(8):
                if (i + j) % 7 != 4:
                    block(contact_side(dielectric),(1.34, (i-3.5)*1.09,(j-3.5)*1.45),(.19,.58,.87),.10,"x")
    part.finish()
    contact_side.finish()
    empty("mount-socket-face", (1.1,0,0), group)
    empty("mount-heatsink-face", (-2.39,0,0), group)
    return group


def samsung_drive():
    group = empty("MZ-V9P2T0BW")
    group["provenance"] = "Original approximation of Samsung SSD 990 PRO 2 TB"
    board = Part("m2-2280-module", group)
    pcb = material("ssd-pcb", (.020,.023,.024), .22,.52)
    traces = material("ssd-faint-copper", (.22,.15,.075), .68,.49)
    pad = material("ssd-gold-plating", (.70,.53,.23), .63,.34)
    ceramic = material("ssd-ceramic", (.13,.12,.085), .21,.49)
    ic = material("ssd-chip-encapsulation", (.052,.053,.061), .14,.57)
    foil = material("ssd-spreader-label", (.036,.042,.054), .25,.44)
    white = material("ssd-printed-label-silver", (.48,.51,.56), .32,.46)
    red = material("ssd-printed-label-red", (.47,.025,.025), .17,.51)
    profile = [(-9.8,-40),(-2.3,-40),(-2.3,-37.8),(-1.35,-36.6),(1.35,-36.6),
               (2.3,-37.8),(2.3,-40),(9.8,-40),(11,-38.6),(11,40),(-11,40)]
    prism(board(pcb), "x", profile, -.08,.85)
    mounting_arc = [(2.83*cos(i*pi/18), -38 + 2.83*sin(i*pi/18)) for i in range(19)]
    rail(board(pad), "x", mounting_arc, -.115,.58,.045)
    for y in [i * .83 - 10 for i in range(25) if i not in (5,6,7)]:
        block(board(pad), (-.13,y,38.3),(.10,.51,3.4),.11,"x")
        block(board(pad), (.89,y,38.3),(.08,.51,3.4),.11,"x")
    for z, d, h in [(-24, 14.2, 13.15),(-7.9, 13.5, 12.8),(19.1, 12.3, 11.5),(5.5, 5.7, 9.1)]:
        block(board(ic),(-.53,0,z),(.90,h,d),.60,"x")
    for y in (-9,-7.7,7.7,9):
        for z in (-30,-26,-19,-11,-5,2,11,15,20,23,28,32,35):
            block(board(traces), (-.14,y,z),(.08,.36,1.25),.08,"x")
            block(board(ceramic), (-.34,y,z),(.36,.31,.69),.06,"x")
    block(board(foil),(-1.01,0,-2.1),(.103,19.1,65.2),.85,"x")
    label(board(white),"SAMSUNG",(-1.076,4.7,-31.5),(0,0,1),(0,1,0),2.45,.19)
    label(board(white),"990 PRO",(-1.076,-1.7,-31.2),(0,0,1),(0,1,0),4.3,.31)
    block(board(red),(-1.06,6.15,22.6),(.06,3.7,10.8),.44,"x")
    label(board(white),"2TB",(-1.096,5.31,19.7),(0,0,1),(0,1,0),1.61,.14)
    for i in range(9):
        if i not in (2,6):
            block(board(white),(-1.072,-5.9,13.0+i*1.45),(.036,.29,.84),0,"x")
    board.finish()
    empty("mount-m2-post", (0,0,-38), group)
    empty("mount-m2-edge", (0,0,38.6), group)
    return group


def corsair_supply():
    group = empty("CP-9020263-NA")
    group["provenance"] = "Original approximation of Corsair RM850e 2023"
    steel = material("psu-coated-steel", (.032,.036,.043), .46,.51)
    grille = material("psu-perforated-metal", (.044,.050,.06), .62,.44)
    trim = material("psu-trim", (.081,.088,.101), .53,.41)
    rubber = material("psu-port-insulator", (.018,.020,.024), .12,.60)
    metal = material("psu-contact", (.39,.33,.17), .71,.48)
    mark = material("psu-legend", (.42,.47,.51), .28,.43)
    shell = Part("modular-enclosure", group)
    for x in (-74.25,74.25):
        block(shell(steel), (x,0,0),(1.5,86,140),1.15,"x")
    block(shell(steel), (0,-42.25,0),(147,1.5,140),1.0,"y")
    for z in (-68.2,68.2):
        block(shell(trim), (0,42.1,z),(149,1.8,3.6),.8,"y")
    perforations(shell(grille),"y",0,0,134,131,43,23,23,.37)
    block(shell(steel), (0,0,69.25),(147,84,1.5),1.2)
    for y in (-40.0,40.0):
        block(shell(trim), (0,y,-69.15),(149,6,1.70),1.1)
    perforations(shell(grille),"z",24.9,0,93,72,-70,18,14,.40,reverse=True)
    block(shell(steel), (-49.3,0,-69.2),(47.6,73,1.6),.8)
    block(shell(rubber), (-49.3,6.4,-69.94),(28.4,19.1,.12),2.45)
    for x, y in [(-56.2,9),(-42.4,9),(-49.3,3.5)]:
        block(shell(metal), (x,y,-69.97),(1.6,3.2,.05),.40)
    block(shell(rubber), (-47.6,24.4,-69.93),(15.8,9.7,.15),1.07)
    for y, group_size in ((21,6),(-1,8),(-21,8)):
        for x in (-47,-21,7,32,56):
            if y == 21 and x == 56:
                continue
            width = 17.2 if group_size == 6 else 22.3
            block(shell(rubber), (x,y,69.96),(width,13,.08),.78)
            for lane in (-2.90,2.90):
                for p in range(group_size//2):
                    xx = x + (p - (group_size/2-1)/2)*4.60
                    block(shell(trim), (xx,y+lane,69.98),(3.50,3.9,.04),.31)
    label(shell(mark),"RM850",(-74.575,2,-46),(0,0,1),(0,1,0),11.75,.85)
    label(shell(mark),"CORSAIR",(-74.84,-12,-45.5),(0,0,1),(0,1,0),4.15,.26)
    shell.finish()

    rotor = Part("rotor-0", group, (0,34,0))
    for i in range(7):
        tapered_blade(rotor(rubber), i * 2*pi/7, 55.9, -1)
    disc(rotor(rubber), "y", 0,0,0,40,5.5,36)
    rim(rotor(trim),"y",0,0,2.79,18,19.2,.16,36)
    rotor.finish()
    empty("mount-atx-psu", (0,0,-70), group)
    return group


if __name__ == "__main__":
    for identifier, (socket, name) in PROCESSORS.items():
        save(identifier, partial(processor_package, socket, name), (-70,24,41), .064)
    save("samsung-990-pro-2tb", samsung_drive, (-100,30,70), .105)
    save("corsair-rm850e-2023", corsair_supply, (-250,185,240), .240)
