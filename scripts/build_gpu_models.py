"""Build original, dimensioned graphics-card visualizations from public references."""

from dataclasses import dataclass
from functools import partial
from math import cos, pi, sin
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_product_models import Part, STROKES, block, disc, empty, label, material, panel_plane, prism, rail, rim, rounded_outline, save, tube


@dataclass(frozen=True)
class Card:
    identifier: str
    model: str
    name: str
    package: tuple[float, float, float]
    family: str
    fans: tuple[float, ...]
    power: tuple[int, ...]
    source: str


ASUS = "https://www.asus.com/motherboards-components/graphics-cards"
PULSE = "https://www.sapphiretech.com/en/consumer"
CARDS = [
    Card("asus-dual-rtx4060-oc", "DUAL-RTX4060-O8G", "RTX 4060", (227.2, 123.24, 49.6),
         "dual", (44, 44), (8,), f"{ASUS}/dual/dual-rtx4060-o8g/"),
    Card("asus-dual-rtx4060-ti-oc", "DUAL-RTX4060TI-O8G", "RTX 4060 TI", (227.2, 123.24, 49.6),
         "dual", (44, 44), (8,), f"{ASUS}/dual/dual-rtx4060ti-o8g/"),
    Card("asus-tuf-rtx4070-ti-super-oc", "TUF-RTX4070TIS-O16G-GAMING", "RTX 4070 TI", (305, 138, 65),
         "tuf", (43, 44, 43), (16,), f"{ASUS}/tuf-gaming/tuf-rtx4070tis-o16g-gaming/"),
    Card("asus-tuf-rtx4080-super-oc", "TUF-RTX4080S-O16G-GAMING", "RTX 4080", (348.2, 150, 72.6),
         "tuf", (49, 50, 49), (16,), f"{ASUS}/tuf-gaming/tuf-rtx4080s-o16g-gaming/"),
    Card("nvidia-rtx4090-fe", "RTX 4090 Founders Edition", "RTX 4090", (304, 137, 61),
         "founders", (55, 55), (16,), "https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/"),
    Card("sapphire-pulse-rx6600", "11310-01-20G", "RX 6600", (193, 120.05, 40.05),
         "pulse-compact", (41, 41), (8,), f"{PULSE}/pulse-radeon-rx-6600-8g-gddr6"),
    Card("sapphire-pulse-rx7600", "11324-01-20G", "RX 7600", (240, 107.1, 44.07),
         "pulse", (45, 45), (8,), f"{PULSE}/pulse-radeon-rx-7600-8g-gddr6"),
    Card("sapphire-pulse-rx7700-xt", "11335-04-20G", "RX 7700 XT", (280, 128.75, 52.57),
         "pulse", (49, 49), (8, 8), f"{PULSE}/pulse-radeon-rx-7700-xt-12g-gddr6"),
    Card("sapphire-pulse-rx7800-xt", "11330-02-20G", "RX 7800 XT", (280, 128.75, 52.57),
         "pulse", (49.5, 49.5), (8, 8), f"{PULSE}/pulse-radeon-rx-7800-xt-16g-gddr6"),
]


STROKES.update({
    "0": [[(.16,0),(0,.16),(0,.84),(.16,1),(.84,1),(1,.84),(1,.16),(.84,0),(.16,0)]],
    "1": [[(.2,.8),(.54,1),(.54,0)],[(.13,0),(.96,0)]],
    "6": [[(.9,.94),(.75,1),(.24,1),(0,.69),(0,.22),(.23,0),(.77,0),(1,.19),(1,.44),(.79,.59),(0,.59)]],
    "7": [[(0,1),(1,1),(.43,0)]],
    "8": [[(.2,.51),(0,.67),(0,.82),(.2,1),(.8,1),(1,.82),(1,.67),(.8,.51),(.2,.51),
           (0,.34),(0,.17),(.25,0),(.75,0),(1,.17),(1,.34),(.8,.51)]],
    "9": [[(.1,.06),(.29,0),(.73,0),(1,.25),(1,.78),(.77,1),(.23,1),(0,.78),(0,.61),(.23,.43),(1,.43)]],
    "D": [[(0,0),(0,1),(.74,1),(1,.72),(1,.28),(.74,0),(0,0)]],
    "I": [[(0,0),(1,0)],[(0,1),(1,1)],[(.5,0),(.5,1)]],
    "N": [[(0,0),(0,1),(1,0),(1,1)]],
    "P": [[(0,0),(0,1),(.81,1),(1,.84),(1,.65),(.81,.51),(0,.51)]],
    "V": [[(0,1),(.5,0),(1,1)]],
})


def stepped_rectangle(length, width, end_chamfer, edge_chamfer=None):
    x = length / 2
    y = width / 2
    edge = end_chamfer if edge_chamfer is None else edge_chamfer
    return [(-x+end_chamfer,-y), (x-end_chamfer,-y), (x,-y+edge), (x,y-edge),
            (x-end_chamfer,y), (-x+end_chamfer,y), (-x,y-edge), (-x,-y+edge)]


def translated(outline, z=0, x=0):
    return [(u+z,v+x) for u,v in outline]


def position_at_boundary(origin, direction, polygon):
    u, v = origin
    dx, dy = direction
    hit = None
    for index, (ax, ay) in enumerate(polygon):
        bx, by = polygon[(index + 1) % len(polygon)]
        ex, ey = bx - ax, by - ay
        denominator = dx*ey - dy*ex
        if abs(denominator) < 1e-9:
            continue
        distance = ((ax-u)*ey - (ay-v)*ex) / denominator
        progress = ((ax-u)*dy - (ay-v)*dx) / denominator
        if distance > 0 and -1e-7 <= progress <= 1+1e-7:
            hit = distance if hit is None else min(distance, hit)
    if hit is None:
        raise ValueError("Fan opening outside shroud sector")
    return u + hit*dx, v + hit*dy


def opening(mesh, pivot, radius, boundary, lower, upper, sides=56):
    """An actual annular opening with angular corner returns and thickness."""
    edges = [(cos(i*2*pi/sides), sin(i*2*pi/sides)) for i in range(sides)]
    outside = [position_at_boundary(pivot, ray, boundary) for ray in edges]
    inside = [(pivot[0]+radius*dx, pivot[1]+radius*dy) for dx,dy in edges]
    a = [panel_plane("y", *point, lower) for point in outside]
    b = [panel_plane("y", *point, upper) for point in outside]
    c = [panel_plane("y", *point, lower) for point in inside]
    d = [panel_plane("y", *point, upper) for point in inside]
    for i in range(sides):
        j = (i + 1) % sides
        mesh.face((a[i],c[i],c[j],a[j]))
        mesh.face((b[i],b[j],d[j],d[i]))
        mesh.face((a[i],a[j],b[j],b[i]))
        mesh.face((c[j],c[i],d[i],d[j]), True)


def rotor_blade(mesh, phase, radius, twist, wide, direction):
    ribbons = [[], [], [], []]
    for index in range(7):
        t = index / 6
        radial = radius * (.31 + t * .682)
        leading = phase + twist*(1-t)**1.38 - .12*t
        trailing = leading + wide*(.54 + .54*sin(.72*pi*t))
        y = (-1.2 + 2.5*t - .75*sin(pi*t))*direction
        for ribbon, angle, pitch, thickness in zip(
            ribbons,
            (leading, trailing, leading, trailing),
            (0, 1.6, 0, 1.6),
            (0, 0, .47, .47),
        ):
            ribbon.append((radial*cos(angle), y + (pitch + thickness)*direction, radial*sin(angle)))
    a,b,c,d = ribbons
    for i in range(len(a)-1):
        j = i + 1
        faces = [(a[i],a[j],b[j],b[i]), (c[i],d[i],d[j],c[j]), (a[i],c[i],c[j],a[j]), (b[i],b[j],d[j],d[i])]
        for face in faces:
            mesh.face(face if direction < 0 else reversed(face), True)
    mesh.face((a[-1], b[-1], d[-1], c[-1]))


def rotor(root, index, position, radius, family, mats, direction=-1):
    outer = Part(f"rotor-{index}", root, position)
    count = 7 if family == "founders" else 11 if family in {"dual","tuf"} else 9
    width = .62 if family == "founders" else .30 if family == "tuf" else .36
    for i in range(count):
        rotor_blade(outer(mats["blade"]), i*2*pi/count, radius, (.79 if index % 2 else -.79), width, direction)
    if family in {"dual", "tuf"}:
        rim(outer(mats["blade"]), "y", 0,0,0, radius-1.8,radius,2.7,56)
    disc(outer(mats["blade"]), "y", 0,0,0, radius*.72,6.0,42)
    disc(outer(mats["hub"]), "y", 0,0,3.2*direction,radius*.625,.50,42)
    rim(outer(mats["silver"] if family == "founders" else mats["trim"]), "y", 0,0,3.48*direction,
        radius*.288,radius*.309,.16,40)
    if family.startswith("pulse"):
        rim(outer(mats["red"]), "y", 0,0,3.45*direction,radius*.15,radius*.169,.20,40)
        label(outer(mats["silver"]), "PULSE", (-8,-3.5,2), (1,0,0),(0,0,-1),3.65,.26)
    if family == "tuf":
        label(outer(mats["silver"]), "TUF", (-6,-3.4,1.6), (1,0,0),(0,0,-1),3.90,.38)
    outer.finish()


def palette(card):
    is_tuf = card.family == "tuf"
    aluminum = (.194,.183,.167) if card.family == "founders" else (.13,.145,.153)
    return {
        "body": material("graphite-housing", (.044,.049,.057) if is_tuf else (.025,.028,.032), .28,.43),
        "trim": material("machined-edge-and-panel-lines", (.122,.137,.153) if is_tuf else (.078,.083,.092), .60,.43),
        "anodized": material("anodized-outer-frame", aluminum,.83,.31),
        "fins": material("anodized-fin-stack", (.080,.086,.093) if card.family == "founders" else (.136,.15,.159),.82,.41),
        "plate": material("coated-backplate", (.042,.046,.054),.57,.45),
        "body-mid": material("smoked-polymer", (.027,.034,.047),.25,.36),
        "blade": material("molded-axial-blade", (.037,.042,.048),.15,.36),
        "hub": material("rotor-hub-disc", (.102,.118,.137),.68,.38),
        "steel": material("rear-brushed-steel", (.32,.34,.35),.79,.39),
        "pipe": material("nickel-copper-airflow", (.26,.21,.16),.79,.34),
        "red": material("printed-crimson-markings", (.54,.013,.025),.25,.49),
        "ink": material("warm-shell-print", (.31,.31,.29),.30,.51),
        "silver": material("silver-model-label", (.57,.60,.61),.44,.36),
        "socket": material("connector-polymer-and-vent", (.011,.013,.016),.17,.55),
        "pcb": material("laminated-fiberglass-board", (.025,.032,.029),.15,.55),
        "gold": material("gold-plated-pcie-fingers", (.60,.38,.104),.58,.35),
        "rgb": material("GPU RGB zone", (.52,.45,.33),.20,.24),
    }


def attach_pcb(root, card, mats):
    length, span, thickness = card.package
    l, w, h = length/2, span/2, thickness/2
    part = Part("pcb-with-pcie-fingers-and-device-connectors", root)
    y = h-8
    end = l*.48 if card.family == "founders" else l*.64
    board = [(-l+2,-w+12),(end-9,-w+12),(end,-w+26),(end,w-13),(-l*.19,w-13),
             (-l*.19,w-1),(-l*.75,w-1),(-l*.75,w-11),(-l+3,w-11)]
    prism(part(mats["pcb"]),"y",board,y,y+1.7)
    for z in [-l*.73 + j*l*.0086 for j in range(61) if j not in (10,11,12)]:
        for dy in (y-.15, y+1.74):
            block(part(mats["gold"]),(w-2.9,dy,z),(3.2,.09,.72),.12,"y")
    for row in range(3):
        for i in range(15):
            block(part(mats["gold"]),(w-19-row*3.1,y+1.77,-l*.49+i*2.75),(.79,.12,.68),.09,"y")
    for z in (-l*.48,-l*.40,-l*.26,l*.11,l*.18):
        block(part(mats["socket"]),(w-22,y+2.2,z),(5.0,1.6,4.7),.44,"y")
    for index, pin_count in enumerate(card.power):
        y0 = h*.27
        z0 = (l * .32 if card.family == "founders" else -l*.02) + index*18
        socket_width = 19 if pin_count == 16 else 14.8
        block(part(mats["socket"]),(-w+6.7,y0,z0),(13.2,12.6,socket_width),1.23,"x")
        columns = 6 if pin_count == 16 else 4
        for row in range(2):
            for column in range(columns):
                dz = (column-(columns-1)/2)*2.54
                block(part(mats["ink"]),(-w+.13,y0+(row-.5)*3.10,z0+dz),(.21,1.43,1.44),.23,"x")
        if pin_count == 16:
            for column in range(4):
                block(part(mats["gold"]),(-w+.11,y0+4.25,z0+(column-1.5)*2.15),(.19,.55,.60),.07,"x")
        empty("connector-12v-16pin" if pin_count == 16 else f"connector-pcie-8pin-{index}",(-w,y0,z0),root)
    part.finish()
    empty("mount-pcie-slot",(w-1,y,-l*.41),root)


def heatsink(root, card, mats):
    length, span, thickness = card.package
    l, w, h = length/2, span/2, thickness/2
    part = Part("sectioned-fins-and-heatpipes", root)
    nose = 13 if card.family in {"tuf","founders"} else 9
    count = int((length-2*nose)/3.55)
    for i in range(count):
        z = -l+nose+(length-2*nose)*(i+.5)/count
        if card.family != "founders" and any(abs(z-target*l) < 2.1 for target in (-.35,.29)):
            continue
        inset = 7.5 if card.family == "founders" else 6.1
        inset += 5.0 if abs(z) > l*.78 else 0.0
        edge = w-inset
        a = h*.48
        b = h*.69
        profile = [(edge-5,-a),(edge,-a+3),(edge,b-5),(edge-4,b),(-edge+5,b),(-edge,b-4),(-edge,-a+5),(-edge+4,-a)]
        prism(part(mats["fins"]), "z", profile,z-.29,z+.29)
    n_pipes = 7 if card.family in {"tuf","founders"} else 5 if length > 250 else 4
    for i in range(n_pipes):
        x = (i/(n_pipes-1)-.5)*(span-38)
        tube(part(mats["pipe"]), [(x,h*.51,-l+11),(x,h*.52,-l*.48),(x*.99,-h*.11,-l*.28),
                                 (x*.92,-h*.11,l*.06),(x,h*.51,l*.31),(x,h*.54,l-11)],2.10,9)
    part.finish()


def io_bracket(root, card, mats):
    length, span, thickness = card.package
    z = -length/2
    socket = Part("steel-io-bracket-and-output-ports", root)
    width, height = (min(126,span-.45), min(thickness-.5,45))
    prism(socket(mats["steel"]), "z", stepped_rectangle(width,height,2.2),z,z+1.42)
    pin_at = (-width*.38,-width*.13,width*.13,width*.38)
    for i, x in enumerate(pin_at):
        face_y = -2 if card.family == "founders" else -1
        block(socket(mats["socket"]),(x,face_y,z+.018),(16.2,6.2,.039),1.2)
        block(socket(mats["ink"]),(x,face_y,z+.006),(11.9,1.25,.020),.19)
        block(socket(mats["socket"]),(x,face_y-.39,z+.012),(11.8,.55,.016),.12)
        block(socket(mats["steel"]),(x,face_y,z+2.55),(18.5,8.1,4.51),.72)
        angle = -1 if card.family.startswith("pulse") else 1
        for k in (-1,0,1):
            rail(socket(mats["socket"]), "z", [(x-5.5+k*3.9,7.5),(x-1.8+k*3.9, height*.43*angle if angle == 1 else height*.45)],
                 z+.019,1.48,.04)
        if i in (0,3):
            disc(socket(mats["ink"]),"z",x+(-9 if i==0 else 9),5,z+.017,2.1,.035,14)
    block(socket(mats["steel"]),(-width*.5+2,0,z+5),(4, height*.94,10),.72)
    socket.finish()
    empty("mount-io-bracket",(0,0,z),root)


def normal_back(root, card, mats):
    length, span, thickness = card.package
    l, w, h = length/2, span/2, thickness/2
    back = Part("segmented-metal-backplate", root)
    is_pulse = card.family.startswith("pulse")
    z_w, x_w = l-2, w-5
    prism(back(mats["plate"]),"y",translated(stepped_rectangle(l*1.34,x_w*2,5.8),-l*.32),h-3.15,h-1.1)
    prism(back(mats["plate"]),"y",[(l*.35,-x_w),(z_w-4,-x_w),(z_w,-x_w+4),(z_w,-x_w+13),(l*.35,-x_w+13)],h-3.15,h-1.1)
    prism(back(mats["plate"]),"y",[(l*.35,x_w-13),(z_w,x_w-13),(z_w,x_w-4),(z_w-4,x_w),(l*.35,x_w)],h-3.15,h-1.1)
    for target in [l*.46,l*.62,l*.78,l*.91]:
        rail(back(mats["trim"]),"y",[(target-l*.08,-x_w+13),(target+l*.02,-x_w*.18),
            (target-l*.01,x_w*.18),(target+l*.08,x_w-13)],h-1.8,2.9,2.1)
    for sign in (-1,1):
        for z in (-l*.82,-l*.56,-l*.10,l*.26,l*.86):
            x = sign*(x_w-4.3)
            disc(back(mats["steel"]),"y",z,x,h-.61,3.7,1.20,16)
            rail(back(mats["socket"]),"y",[(z-.89,x),(z+.89,x)],h-.002,.36,.03)
    if is_pulse:
        pulse = [(-l*.89,-w*.22),(-l*.71,-w*.22),(-l*.64,w*.24),(-l*.55,-w*.47),(-l*.44,w*.15),
                 (-l*.38,-w*.22),(-l*.18,-w*.22)]
        rail(back(mats["red"]),"y",pulse,h-1.04,1.45,.26)
    else:
        for shift in (0, 4):
            rail(back(mats["trim"]),"y",[(-l*.84,-w+15+shift),(-l*.57,-w+15+shift),(-l*.4,-w*.44+shift),
                                        (l*.23,-w*.44+shift)],h-1.05,.77,.21)
    label(back(mats["ink"] if is_pulse else mats["silver"]),card.name,(-w*.18,h-.86,-l*.81),(0,0,1),(1,0,0),7.7,.47)
    back.finish()


def ordinary_body(root, card, mats):
    length, span, thickness = card.package
    l, w, h = length/2, span/2, thickness/2
    is_pulse = card.family.startswith("pulse")
    end = l - (3.3 if card.family == "pulse-compact" else 4.2)
    strip = w-2.6
    count = len(card.fans)
    step = end*2/count
    front = Part("angular-axial-shroud-and-side-molding", root)
    for i, radius in enumerate(card.fans):
        middle = (-end+step*(i+.5))
        fan_y = -h+6.0
        fan_x = -1.5 if card.family == "pulse-compact" else 0.0
        opening_boundary = translated(stepped_rectangle(step-.35,strip*2,4.6 if card.family=="tuf" else 3.0,6),middle)
        opening(front(mats["body"]),(middle,fan_x),radius+1.2,opening_boundary,-h,-h+4.1)
        rim(front(mats["trim"]),"y",middle,fan_x,-h+.48,radius+.52,radius+2.52,1.1,56)
        rim(front(mats["socket"]),"y",middle,fan_x,-h+3.3,radius-.62,radius+1.41,2.9,56)
        rotor(root,i,(fan_x,fan_y,middle),radius-.9,card.family,mats)
    for seam in range(1,count):
        z = -end+step*seam
        block(front(mats["body-mid"]),(0,-h+3.8,z),(span-8,1.7,7),.72,"y")
    for sign in (-1,1):
        x1 = sign*(w-5.1)
        x2 = sign*w
        low, high = sorted((x1,x2))
        if is_pulse:
            for lo,hi in [(-l+5,-l*.27),(l*.62,l-1)]:
                outline = [(lo,-h+2),(hi,-h+2),(hi,h*.23),(hi-4,h*.58),(lo+3,h*.58)]
                prism(front(mats["body-mid"]),"x",[(v,u) for u,v in reversed(outline)],low,high)
        else:
            spine = [(-h,-l+5),(-h,l-4),(-h*.42,l-1),(.26*h,l-9),
                     (h*.26,l*.71),(-h*.07,l*.57),(-h*.07,-l*.55),(h*.21,-l*.81),(h*.11,-l+3)]
            prism(front(mats["body"]),"x",spine,low,high)
            for z in (-l*.84,-l*.69,l*.68,l*.84):
                block(front(mats["trim"]),(sign*(w-.5),-h*.28,z),(1,12,2.4),.73,"x")
    if is_pulse:
        label(front(mats["red"]),"RADEON",(-w+.11,-h*.22,-l*.88),(0,0,1),(0,1,0),6.8,.52)
        label(front(mats["red"]),"SAPPHIRE",(-w+.11,-h*.22,l*.64),(0,0,1),(0,1,0),4.2,.31)
        for shift in (0,3.2,6.4):
            ray = [(-l*.90,-w*.61+shift),(-l*.66,-w*.61+shift)]
            rail(front(mats["red"]),"y",ray,-h+.03,.49,.08)
            ray = [(-l*.28,w*.64-shift),(-l*.11,w*.64-shift),(l*.10,-w*.63+shift),(l*.27,-w*.63+shift)]
            rail(front(mats["red"]),"y",ray,-h+.03,.45,.08)
    else:
        label(front(mats["silver"]),"GEFORCE RTX",(-w+.03,-h*.83,-l*.75),(0,0,1),(0,1,0),
              8.3 if card.family=="tuf" else 6.9,.55)
        for sign in (-1,1):
            for delta in (0,3.5,7.0):
                u = sign*(w*.80 - delta)
                rail(front(mats["trim"]),"y",[(-l*.93,u),(-l*.81,u),(l*.81,u),(l*.92,u)],-h+.08,1.05,.18)
        if card.family == "tuf":
            block(front(mats["rgb"]),(-w+.2,-h*.42,l*.71),(.8,4.6,18.5),.28,"x")
            block(front(mats["trim"]),(-w+.19,-h*.59,l*.89),(1.2,4.6,9.6),.23,"x")
            label(front(mats["ink"]),"TUF",(-w+.01,-h*.16,l*.78),(0,0,1),(0,1,0),5.5,.43)
        else:
            label(front(mats["ink"]),"DUAL",(-w+.03,-h*.19,l*.70),(0,0,1),(0,1,0),5.8,.43)
    block(front(mats["body"]),(0,-h*.04,l-1.3),(span-10,thickness*.82,2.6),2.15)
    block(front(mats["trim"]),(0,-h*.30,l-.05),(span-16,2.2,.13),.78,"z")
    if card.family == "tuf":
        for x in [-w*.57 + index*w*.114 for index in range(11)]:
            block(front(mats["socket"]),(x,h*.15,l+.02),(2.25,5.5,.065),.75)
    else:
        for sign in (-1,1):
            rail(front(mats["trim"]),"z",[(sign*w*.87,h*.05),(sign*w*.71,h*.24),(sign*w*.48,h*.24)],l+.03,.72,.10)
    for sign in (-1,1):
        for z in (-l*.91,l*.91):
            disc(front(mats["steel"]),"y",z,sign*w*.69,-h+.21,3.6,.47,16)
    front.finish()


def founders_body(root, card, mats):
    length, span, thickness = card.package
    l,w,h = length/2,span/2,thickness/2
    shell = Part("founders-champagne-frame-crossflow-panels",root)
    shape = rounded_outline(length-3,span,12.5,steps=6)
    for y in (-h+1.85,h-1.85):
        for i,a in enumerate(shape):
            b = shape[(i+1)%len(shape)]
            rail(shell(mats["anodized"]),"y",[a,b],y,3.0,3.70)
    for side,turn in ((-1,0),(1,1)):
        y = side*(h-1.6)
        pivot = side*l*.48
        opening_outline = translated(stepped_rectangle(l-3,span-4,10.5,8),side*l*.49)
        opening(shell(mats["socket"]),(pivot,0),card.fans[turn]+1.55,opening_outline,y-1.35,y+1.35)
        rim(shell(mats["trim"]),"y",pivot,0,y,card.fans[turn]+.2,card.fans[turn]+2.30,2.0,64)
        cover = [(-l+2,-w+7),(-l+14,-w+2),(-l*.31,-w+2),(0,-2.8),(0,2.8),
                 (-l*.31,w-2),(-l+14,w-2),(-l+2,w-7)]
        if side < 0:
            cover = list(reversed([(-u,v) for u,v in cover]))
        prism(shell(mats["plate"]),"y",cover,y-1.4,y+1.4)
        line = [(-l+14,-w+4),(-l*.31,-w+4),(-2,0),(-l*.31,w-4),(-l+14,w-4)]
        if side < 0:
            line = [(-u,v) for u,v in line]
        rail(shell(mats["anodized"]),"y",line,y,3.9,3.2)
        rotor(root,turn,(0,side*(h-5.5),pivot),card.fans[turn],"founders",mats,side)
    for sign in (-1,1):
        # Open center rails and continuous machined bridges leave a view of the transverse fins.
        plate_x = sign*(w-1.4)
        for z in (-l*.91,l*.91):
            block(shell(mats["anodized"]),(plate_x,0,z),(2.8,thickness-2.9,22.7),1.35,"x")
        block(shell(mats["anodized"]),(plate_x,0,0),(2.8,thickness-2.9,14.9),1.12,"x")
    label(shell(mats["silver"]),"GEFORCE RTX",(-w+.15,-h*.32,l*.46),(0,0,1),(0,1,0),7.8,.62)
    label(shell(mats["silver"]),"RTX 4090",(-w*.36,h-.02,-l*.82),(0,0,1),(1,0,0),10.0,.68)
    shell.finish()


def exact_envelope(root, card):
    bpy.context.view_layer.update()
    points = [child.matrix_world @ Vector(vertex) for child in root.children_recursive if child.type == "MESH" for vertex in child.bound_box]
    lower = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    upper = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    size = upper - lower
    length,span,thickness = card.package
    target = (span/1000,length/1000,thickness/1000)
    center = (upper + lower) / 2
    scale = Vector(tuple(wanted/natural for wanted,natural in zip(target,size)))
    root.location = Vector(tuple(-axis*k for axis,k in zip(center,scale)))
    root.scale = scale


def make_card(card):
    root = empty(card.model)
    root["provenance"] = "LUMO authored approximation from manufacturer profile and official dimensions"
    root["reference"] = card.source
    root["envelope_mm"] = list(card.package)
    mats = palette(card)
    heatsink(root,card,mats)
    attach_pcb(root,card,mats)
    if card.family == "founders":
        founders_body(root,card,mats)
    else:
        normal_back(root,card,mats)
        ordinary_body(root,card,mats)
    io_bracket(root,card,mats)
    exact_envelope(root,card)
    return root


if __name__ == "__main__":
    requested = set(sys.argv[sys.argv.index("--")+1:]) if "--" in sys.argv else set()
    only_cards = requested - {"--render"}
    for card in CARDS:
        if not only_cards or card.identifier in only_cards:
            save(card.identifier,partial(make_card,card),(-350,-320,390),max(.25,card.package[0]*.00131))
