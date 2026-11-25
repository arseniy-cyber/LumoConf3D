"""Generate original product visualizations with Blender 4.3+.

Run from the repository: blender -b -t 4 --python scripts/build_product_models.py
Add "-- --render" to render source PNGs to /tmp/lumo-model-renders.
All model coordinates below are in millimetres, with the same axes as the GLB.
"""

from math import atan2, cos, pi, sin
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = Path(os.environ.get("LUMO_MODEL_OUTPUT", ROOT / "public" / "models")).resolve()
OUTPUT.mkdir(parents=True, exist_ok=True)
GENERATION_RENDER = "--render" in sys.argv
GPU_ID = "asus-dual-rtx4070-super-oc"
CASE_ID = "nzxt-h5-flow-2024"


def xyz(position):
    x, y, z = position
    return x / 1000, -z / 1000, y / 1000


def material(name, color, metal=0, rough=.48, alpha=1):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, alpha)
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = m.diffuse_color
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["Alpha"].default_value = alpha
    if alpha < 1:
        m.surface_render_method = "BLENDED"
        m.use_backface_culling = True
    return m


def empty(name, position=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    obj.location = xyz(position)
    return obj


class Mesh:
    def __init__(self, material):
        self.material = material
        self.vertices = []
        self.faces = []
        self.points = {}
        self.smooth_faces = set()

    def face(self, points, smooth=False):
        indices = []
        for vertex in points:
            rounded = tuple(round(value, 5) for value in vertex)
            if rounded not in self.points:
                self.points[rounded] = len(self.vertices)
                self.vertices.append(xyz(rounded))
            indices.append(self.points[rounded])
        if len(set(indices)) < 3:
            return
        if smooth:
            self.smooth_faces.add(len(self.faces))
        self.faces.append(indices)

    def object(self, name, parent):
        if not self.faces:
            return None
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices, [], self.faces)
        mesh.validate()
        for polygon in mesh.polygons:
            polygon.use_smooth = polygon.index in self.smooth_faces
        mesh.materials.append(self.material)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        return obj


class Part:
    def __init__(self, name, parent, position=(0, 0, 0)):
        self.node = empty(name, position, parent)
        self.meshes = {}

    def __call__(self, m):
        if m not in self.meshes:
            self.meshes[m] = Mesh(m)
        return self.meshes[m]

    def finish(self):
        for m, buffer in self.meshes.items():
            buffer.object(f"{self.node.name}.{m.name}", self.node)


def panel_plane(axis, u, v, w):
    if axis == "x":
        return w, u, v
    if axis == "y":
        return v, w, u
    return u, v, w


def prism(mesh, axis, outline, a, b, smooth=False, caps=True):
    low = [panel_plane(axis, u, v, a) for u, v in outline]
    high = [panel_plane(axis, u, v, b) for u, v in outline]
    if caps:
        mesh.face(reversed(low))
        mesh.face(high)
    for i, last in enumerate(low):
        j = (i + 1) % len(low)
        mesh.face((last, low[j], high[j], high[i]), smooth)


def rounded_outline(width, height, radius, u=0, v=0, steps=4):
    return [
        (u + su * (width / 2 - radius) + radius * cos((q + s / steps) * pi / 2),
         v + sv * (height / 2 - radius) + radius * sin((q + s / steps) * pi / 2))
        for q, (su, sv) in enumerate(((1, 1), (-1, 1), (-1, -1), (1, -1)))
        for s in range(steps + 1)
    ]


def block(mesh, center, dimensions, radius=0, axis="z"):
    x, y, z = center
    dx, dy, dz = dimensions
    u, v, w, du, dv, dw = {
        "x": (y, z, x, dy, dz, dx),
        "y": (z, x, y, dz, dx, dy),
        "z": (x, y, z, dx, dy, dz),
    }[axis]
    if radius:
        outline = rounded_outline(du, dv, min(radius, du / 2, dv / 2), u, v)
    else:
        outline = [(u - du / 2, v - dv / 2), (u + du / 2, v - dv / 2),
                   (u + du / 2, v + dv / 2), (u - du / 2, v + dv / 2)]
    prism(mesh, axis, outline, w - dw / 2, w + dw / 2)


def circle(u, v, radius, sides=32):
    return [(u + radius * cos(i * 2 * pi / sides), v + radius * sin(i * 2 * pi / sides))
            for i in range(sides)]


def disc(mesh, axis, u, v, w, diameter, thickness, sides=32):
    prism(mesh, axis, circle(u, v, diameter / 2, sides), w - thickness / 2, w + thickness / 2, True)


def rim(mesh, axis, u, v, w, inner, outer, depth=.4, sides=40):
    outer_points = circle(u, v, outer, sides)
    inner_points = circle(u, v, inner, sides)
    outer_lower, outer_upper, inner_lower, inner_upper = (
        [panel_plane(axis, *point, height) for point in points]
        for points, height in ((outer_points, w - depth / 2), (outer_points, w + depth / 2),
                               (inner_points, w - depth / 2), (inner_points, w + depth / 2))
    )
    for i in range(sides):
        j = (i + 1) % sides
        mesh.face((outer_upper[i], outer_upper[j], inner_upper[j], inner_upper[i]))
        mesh.face((outer_lower[j], outer_lower[i], inner_lower[i], inner_lower[j]))
        mesh.face((outer_lower[i], outer_lower[j], outer_upper[j], outer_upper[i]), True)
        mesh.face((inner_lower[j], inner_lower[i], inner_upper[i], inner_upper[j]), True)


def rail(mesh, axis, path, w, width, depth=.45):
    for (u0, v0), (u1, v1) in zip(path, path[1:]):
        ang = atan2(v1 - v0, u1 - u0)
        du, dv = -sin(ang) * width / 2, cos(ang) * width / 2
        prism(mesh, axis, [(u0+du,v0+dv), (u0-du,v0-dv), (u1-du,v1-dv), (u1+du,v1+dv)],
              w - depth / 2, w + depth / 2)


def tube(mesh, points, radius, sides=12):
    rings = []
    positions = [Vector(p) for p in points]
    for i, point in enumerate(positions):
        tangent = (positions[min(i + 1, len(points) - 1)] - positions[max(i - 1, 0)]).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .93 else Vector((0, 1, 0))
        u = tangent.cross(reference).normalized()
        v = tangent.cross(u).normalized()
        rings.append([tuple(point + radius * (u * cos(j * 2*pi/sides) + v * sin(j * 2*pi/sides)))
                      for j in range(sides)])
    for a, b in zip(rings, rings[1:]):
        for i in range(sides):
            j = (i + 1) % sides
            mesh.face((a[i], a[j], b[j], b[i]), True)
    mesh.face(reversed(rings[0]))
    mesh.face(rings[-1])


# Simple original single-stroke lettering converted to mesh. Product names are labels.
STROKES = {
    "A": [[(0,0),(.5,1),(1,0)],[(.22,.43),(.78,.43)]],
    "C": [[(1,.88),(.82,1),(.18,1),(0,.8),(0,.2),(.18,0),(.82,0),(1,.12)]],
    "E": [[(1,1),(0,1),(0,0),(1,0)],[(0,.51),(.82,.51)]],
    "F": [[(0,0),(0,1),(1,1)],[(0,.54),(.82,.54)]],
    "G": [[(1,.84),(.82,1),(.18,1),(0,.8),(0,.22),(.18,0),(.82,0),(1,.2),(1,.47),(.57,.47)]],
    "H": [[(0,0),(0,1)],[(1,0),(1,1)],[(0,.5),(1,.5)]],
    "L": [[(0,1),(0,0),(1,0)]],
    "O": [[(.18,0),(0,.2),(0,.8),(.18,1),(.82,1),(1,.8),(1,.2),(.82,0),(.18,0)]],
    "R": [[(0,0),(0,1),(.83,1),(1,.86),(1,.61),(.83,.48),(0,.48)],[(.64,.48),(1,0)]],
    "S": [[(1,.88),(.82,1),(.18,1),(0,.83),(0,.64),(.18,.52),(.82,.48),(1,.36),(1,.17),(.82,0),(.18,0),(0,.12)]],
    "T": [[(0,1),(1,1)],[(.5,1),(.5,0)]],
    "U": [[(0,1),(0,.18),(.18,0),(.82,0),(1,.18),(1,1)]],
    "W": [[(0,1),(.18,0),(.5,.57),(.82,0),(1,1)]],
    "X": [[(0,1),(1,0)],[(1,1),(0,0)]],
    "4": [[(.73,0),(.73,1),(0,.31),(1,.31)]],
    "5": [[(1,1),(0,1),(0,.52),(.8,.52),(1,.34),(1,.17),(.82,0),(.18,0),(0,.13)]],
}


def label(mesh, text, origin, horizontal, vertical, size, stroke=.55):
    def point(x, y):
        return tuple(a + x * u + y * v for a, u, v in zip(origin, horizontal, vertical))

    for index, character in enumerate(text):
        for segment in STROKES.get(character, []):
            points = [point((index * .87 + x * .62) * size, y * size) for x, y in segment]
            for a, b in zip(points, points[1:]):
                tube(mesh, (a, b), stroke / 2, 4)


def ring_housing(mesh, axis, center, inner, outer_limits, a, b, sides=64):
    u, v = center
    left, right, bottom, top = outer_limits
    inner_points, outer_points = [], []
    for i in range(sides):
        angle = 2 * pi * i / sides
        cx, cy = cos(angle), sin(angle)
        extent_u = ((right if cx > 0 else left) - u) / cx if abs(cx) > .001 else 1e6
        extent_v = ((top if cy > 0 else bottom) - v) / cy if abs(cy) > .001 else 1e6
        extent = min(extent_u, extent_v)
        inner_points.append((u + inner * cx, v + inner * cy))
        outer_points.append((u + extent * cx, v + extent * cy))
    for i in range(sides):
        j = (i + 1) % sides
        high = [panel_plane(axis, *point, b) for point in
                (outer_points[i], outer_points[j], inner_points[j], inner_points[i])]
        low = [panel_plane(axis, *point, a) for point in
               (outer_points[i], outer_points[j], inner_points[j], inner_points[i])]
        mesh.face(high)
        mesh.face(reversed(low))
        mesh.face((low[0], low[1], high[1], high[0]))
        mesh.face((low[3], high[3], high[2], low[2]), True)


def tapered_blade(mesh, angle, radius, sign):
    top_a, top_b, bottom_a, bottom_b = [], [], [], []
    sections = 9
    for i in range(sections):
        t = i / (sections - 1)
        r = (0.30 + .695 * t) * radius
        twist = sign * (.79 * (1 - t)**1.34 - .10 * t)
        spread = .27 + .15 * sin(pi*t) - .115*t
        upper_y = -1.6 + 3.6*t - 1.35*sin(pi*t)
        lower_y = upper_y + .63
        angle_a = angle + twist
        angle_b = angle + twist + spread
        top_a.append((r * cos(angle_a), upper_y, r * sin(angle_a)))
        top_b.append((r * cos(angle_b), upper_y + 2.0, r * sin(angle_b)))
        bottom_a.append((r * cos(angle_a), lower_y, r * sin(angle_a)))
        bottom_b.append((r * cos(angle_b), lower_y + 2.0, r * sin(angle_b)))
    for i in range(sections - 1):
        j = i + 1
        mesh.face((top_a[i], top_a[j], top_b[j], top_b[i]), True)
        mesh.face((bottom_a[j], bottom_a[i], bottom_b[i], bottom_b[j]), True)
        mesh.face((top_a[j], top_a[i], bottom_a[i], bottom_a[j]), True)
        mesh.face((top_b[i], top_b[j], bottom_b[j], bottom_b[i]), True)
    mesh.face((top_a[-1], bottom_a[-1], bottom_b[-1], top_b[-1]), True)


def make_gpu():
    root = empty("DUAL-RTX4070S-O12G")
    root["provenance"] = "Original approximation from ASUS published dimensions and product images"
    shroud = material("molded-graphite", (.033, .038, .046), .26, .42)
    facet = material("satin-chamfer", (.075, .084, .095), .47, .39)
    smoke = material("smoked-polymer", (.028, .042, .062), .56, .26)
    alloy = material("aluminium-fin", (.158, .168, .181), .82, .42)
    bracket_metal = material("stainless-bracket", (.33, .36, .40), .85, .38)
    board_m = material("black-fr4", (.022, .024, .023), .25, .55)
    copper = material("nickel-plated-heatpipe", (.26, .21, .156), .82, .34)
    gold = material("gold-plated-contact", (.53, .34, .068), .67, .37)
    ink = material("neutral-silver-label", (.34, .37, .415), .42, .42)
    blade = material("axial-fan-polymer", (.030, .033, .038), .16, .40)
    hub = material("hub-brushed-metal", (.19, .21, .235), .64, .29)
    black = material("socket-polymer", (.012, .014, .018), .09, .62)

    circuit = Part("pcb-and-connector", root)
    prism(circuit(board_m), "y", [(-130,-57),(-102,-59),(28,-59),(58,-53),(88,-51),
                                  (94,-19),(96,54),(38,55),(37,66.97),(-46,66.97),
                                  (-46,55),(-83,55),(-83,62),(-130,62)], 18, 20)
    for i in range(63):
        z = -45 + i * 1.31
        if z > -35 and z < -31:
            continue
        block(circuit(gold), (64.7,20.1,z), (3.8,.22,.66), .26, "y")
        block(circuit(gold), (64.7,17.92,z), (3.8,.16,.66), .24, "y")
    for i in range(9):
        for j in range(8):
            x, z = -15 + i * 3.35, -46 + j * 4.10
            if i in (3,4,5) and j in (2,3,4,5):
                continue
            block(circuit(gold), (x,20.25,z), (.75,.40,1.25), .12, "y")
    for x, z in [(-8, -33), (9, -21), (9, -36), (-15, -24)]:
        block(circuit(black), (x,20.8,z), (6,1.6,6), .45, "y")
    for i in range(6):
        for j in range(2):
            x = -52 + j * 4
            z = 3 + i * 3.5
            block(circuit(gold), (x,18.2,z), (1.6,1.2,1.4), .22, "y")
    circuit.finish()

    cooler = Part("heatsink-and-heatpipes", root)
    for i in range(75):
        z = -117 + i * 3.23
        span = 104 if i < 53 else 96
        outline = [(-span/2,-14),(-span/2,10),(-span/2+4,14),
                   (span/2-4,14),(span/2,10),(span/2,-12),(span/2-2,-14)]
        prism(cooler(alloy), "z", list(reversed(outline)), z-.28, z+.28)
    for x in (-42, -25, -10, 12, 29, 44):
        tube(cooler(copper), [(x,12,z) for z in (-118,-90,-44,0,43,85,119)], 2.25)
    for z in (-75,23,95):
        block(cooler(bracket_metal), (-49,11,z), (6,11,3.5), 1.2, "y")
    cooler.finish()

    face = Part("dual-fan-shroud", root)
    for z, limits in [(-62,(-127,-1,-59,59)),(60,(-1,133.505,-59,59))]:
        ring_housing(face(shroud), "y", (z,-1), 47, limits, -25.565, -20.6)
        rim(face(facet), "y", z,-1,-24.55,46.55,48.9,1.05,68)
        rim(face(black), "y", z,-1,-22.1,45.1,46.6,2.85,68)
    prism(face(smoke), "x", [(-22,-126),(9,-126),(17,-114),(16,-30),(9,-10),
                             (16,2),(19,111),(14,129),(-21,132)], -66.52, -61.8)
    prism(face(facet), "x", [(-20,-124),(-14,-124),(-14,128),(-20,131)], -61.8, -58.4)
    prism(face(shroud), "x", [(-24,-122),(11,-120),(12,128),(-20,133.1)], 53.9, 58.6)
    block(face(shroud), (0,-3,131.0), (119,34,5.01), 3.8)
    for z in (-75, -32, 23, 83, 121):
        block(face(facet), (-61.75,-1.4,z), (3.3,18.2,1.8), .65, "x")
    for path in [[(-124,-44),(-113,-53),(-107,-53),(-93,-44)], [(-128,46),(-113,53),(-99,53)],
                 [(0,-53),(12,-54),(21,-49)], [(105,53),(117,53),(125,46)]]:
        rail(face(ink), "y", path, -25.3, .64)
    label(face(ink), "GEFORCE RTX", (-66.65, -.4, -92), (0,0,1), (0,1,0), 7.6, .63)
    label(face(ink), "DUAL", (-66.65, -.4, 79), (0,0,1), (0,1,0), 6, .52)
    face.finish()

    for i, z in enumerate((-62, 60)):
        rotor = Part(f"rotor-{i}", root, (-1, -18.7, z))
        for b in range(11):
            tapered_blade(rotor(blade), b * 2 * pi / 11, 45.7, 1 if i == 0 else -1)
        rim(rotor(blade), "y", 0,0,-.30,44.55,46.15,3.1,64)
        disc(rotor(blade), "y", 0,0,-.8,32,6,48)
        disc(rotor(hub), "y", 0,0,-4.15,28.8,.6,48)
        rim(rotor(ink), "y", 0,0,-4.51,13.0,13.55,.32,48)
        for j in range(3):
            rim(rotor(hub), "y", 0,0,-4.51,3.8+j*2.8,3.94+j*2.8,.10,40)
        rotor.finish()

    backplate = Part("backplate-flow-through", root)
    panels = [
        [(-128,-55),(-113,-59),(90,-59),(107,-54),(89,-33),(64,-7),(-128,-7)],
        [(-128,7),(73,7),(96,33),(112,55),(90,57),(-119,57),(-128,49)],
        [(-128,-7),(-62,-7),(-62,7),(-128,7)],
        [(-14,-7),(61,-7),(73,7),(-14,7)],
        [(91,-52),(128,-55),(133,-49),(133,52),(128,56),(110,55),(123,40),(123,-40)],
        [(85,-9),(122,-40),(129,-36),(99,-7),(128,21),(124,25),(91,0)],
    ]
    for panel in panels:
        prism(backplate(shroud), "y", panel, 20.5, 24.6)
    rail(backplate(ink), "y", [(-121,-46),(-70,-46),(-43,-23),(40,-23),(71,-47),(85,-47)], 24.65, .55)
    rail(backplate(ink), "y", [(-109,43),(-62,43),(-46,28),(-8,28),(12,43),(91,43)], 24.65, .42)
    for x, z in [(-54,-116),(47,-115),(-40,-74),(35,-70),(-33,-4),(35,-7),(-44,67),(46,64),(44,117),(-46,117)]:
        disc(backplate(bracket_metal), "y", z,x,24.88,4.0,1.35,16)
        rail(backplate(black), "y", [(z-1.1,x),(z+1.1,x)], 25.54, .37, .04)
        rail(backplate(black), "y", [(z,x-1.1),(z,x+1.1)], 25.54, .37, .04)
    label(backplate(ink), "GEFORCE RTX", (-47,24.9,-114), (0,0,1), (1,0,0), 7.2, .53)
    block(backplate(black), (-53.4,11,-11), (18,12,27), 1.5, "x")
    for y in (8.4,13.6):
        for z in (-21,-17,-13,-9,-5,-1):
            block(backplate(gold), (-62.45,y,z), (.3,1.75,1.85), .25, "x")
    backplate.finish()

    bracket = Part("pcie-io-bracket", root)
    block(bracket(bracket_metal), (1,0,-132.8),(129,39,1.41), 1.9)
    block(bracket(bracket_metal), (-63,0,-128),(4,40,10), .95, "y")
    for i, x in enumerate((-39,-14,11,36)):
        block(bracket(black), (x,-6,-133.48),(16.2,6.2,.05), 1.1)
        block(bracket(black), (x,5.5,-133.48),(14,2.5,.05), .65)
        block(bracket(gold), (x,-5.7,-133.50),(12.8,.48,.01), .12)
    for x in (-50,-28,-3,22,46):
        block(bracket(black), (x,14,-133.48),(11.4,2.0,.05), .5)
    bracket.finish()
    empty("mount-pcie-slot", (66.9,18,-65), root)
    empty("mount-io-bracket", (0,0,-133.505), root)
    empty("connector-12v-16pin", (-62.45,11,-11), root)
    return root


def perforations(mesh, axis, u, v, width, height, surface, cols, rows, open_ratio=.48, hexagon=True, reverse=False):
    """A partitioned sheet with genuine openings, using a rotated hex or round aperture."""
    span_u, span_v = width / cols, height / rows
    for row in range(rows):
        for col in range(cols):
            center_u = u - width / 2 + (col + .5) * span_u
            center_v = v - height / 2 + (row + .5) * span_v
            count = 8 if hexagon else 4
            if hexagon:
                outer = [(.5,0),(.5,.5),(0,.5),(-.5,.5),(-.5,0),(-.5,-.5),(0,-.5),(.5,-.5)]
                inner = [(open_ratio*cos(j*2*pi/count),open_ratio*sin(j*2*pi/count)) for j in range(count)]
            else:
                outer = [(.5,.5),(-.5,.5),(-.5,-.5),(.5,-.5)]
                inner = [(a*open_ratio*2,b*open_ratio*2) for a,b in outer]
            a = [panel_plane(axis, center_u+du*span_u,center_v+dv*span_v,surface) for du,dv in outer]
            b = [panel_plane(axis, center_u+du*span_u,center_v+dv*span_v,surface) for du,dv in inner]
            for i in range(count):
                j = (i+1) % count
                face = (a[i], a[j], b[j], b[i])
                mesh.face(reversed(face) if reverse else face)


def tray_panel(mesh, axis, opening, limits, low, high):
    left, right, bottom, top = limits
    ox, oy, width, height = opening
    a = ox - width / 2
    b = ox + width / 2
    c = oy - height / 2
    d = oy + height / 2
    for x1, y1, x2, y2 in [(left,bottom,a,top),(a,bottom,b,c),(a,d,b,top),(b,bottom,right,top)]:
        prism(mesh, axis, [(x1,y1),(x2,y1),(x2,y2),(x1,y2)], low, high)


def make_case():
    root = empty("CC-H52FB-01")
    root["provenance"] = "Original black NZXT H5 Flow (2024) approximation from published specs and product photography"
    steel = material("case-shell-coated-steel", (.033, .040, .050), .42, .49)
    edge = material("case-frame-rail", (.061, .069, .082), .48, .42)
    inner = material("case-tray-stamped-steel", (.045, .051, .059), .39, .53)
    mesh_steel = material("case-perforated-steel", (.054, .060, .071), .48, .57)
    rear_m = material("case-rear-steel", (.031, .035, .043), .52, .50)
    screw = material("case-semisatin-fastener", (.070, .08, .095), .72, .36)
    dark = material("case-rubber-and-socket", (.014, .017, .022), .16, .67)
    silk = material("case-front-lettering", (.10, .113, .131), .48, .44)
    clamp = material("case-antivibration-steel", (.17, .18, .20), .65, .44)
    button = material("case-power-button", (.095, .107, .124), .58, .43)
    glass_m = material("case-glass-tinted", (.22, .27, .36), .15, .20, .16)
    # glTF preserves alpha blend. Double-sided transparency is controlled by the viewer.
    glass_m.use_backface_culling = False

    frame = Part("chassis-frame", root)
    for x in (-107.2, 107.2):
        for z in (-204.5,204.5):
            block(frame(steel), (x, 7.0, z), (7.4, 438.0, 9.0), 1.4, "y")
            block(frame(edge), (x, -221.5,z), (9.0, 19.4, 14), 1.0, "z")
            block(frame(dark), (x,-232.0,z), (10.6,1.0,21), .55, "y")
        for y in (-207.,-131.8,223.4,228.1):
            block(frame(steel), (x, y, 0), (8.2, 4.6, 415.5), 1.2, "x")
    for y in (-211., -133.7,225.0):
        for z in (-206.,204.):
            block(frame(steel), (0,y,z), (213,6.2,8.0), 1.3, "x")
    for z in (-171., 155.):
        block(frame(inner), (0,-204.7,z), (201, 3.8, 18.3), 1.5, "y")
    block(frame(inner), (0,-212.9,0), (210,2.4,411), 2.0, "y")
    block(frame(steel), (-106.6, -204.4, 0), (8.2, 6.7, 409), 1.35, "x")
    frame.finish()

    front = Part("front-panel", root)
    for x in (-109.5, 109.5):
        block(front(steel), (x,8.7,210.7), (6, 439.2, 8.6), 1.65, "z")
        block(front(edge), (x*.971, 21.,213.6), (1.2, 412, 1.9), .55, "z")
    block(front(steel), (0,226.1,210.7), (219,6.7,8.6), 1.5, "z")
    block(front(steel), (0,-203.1,210.7), (220,24.7,8.6), 1.6, "z")
    block(front(steel), (0,-188.8,212.1), (219,4.5,5.8), 1.25, "z")
    perforations(front(mesh_steel),"z",0,18.0,211,411,214.75,34,67,.38)
    label(front(silk), "H5 FLOW", (-30,-207.4,214.725), (1,0,0),(0,1,0),8.2,.55)
    front.finish()

    # Interior mount sheet sits behind the front mesh and carries three 120 mm openings.
    front_mount = Part("front-fan-carrier", root)
    for x in (-89., 89.):
        block(front_mount(inner), (x,10.,196.3), (21, 401, 1.8), 2.5, "z")
    for y in (-180., -107., 17., 141., 209.):
        block(front_mount(inner), (0,y,196.5), (188, 9, 2.2), 1.5, "z")
    for y in (-108., 17., 142.):
        for x in (-62.5,62.5):
            block(front_mount(steel), (x,y,196.5), (4.3,102.0,1.8), 1.4, "z")
        empty("mount-front-fan", (0,y,194.8), root)
    front_mount.finish()

    top = Part("top-panel", root)
    block(top(steel), (83,230.1,.3), (56,4.8,420), 2.0, "y")
    block(top(steel), (-107,230.1,.3), (9,4.8,420), 1.5, "y")
    for z in (-207.6,207.6):
        block(top(edge), (-22,230.18,z), (178,4.55,8.5), 1.6, "y")
    perforations(top(mesh_steel), "y", .2,-23.2,405,158,232.5,60,23,.365)
    disc(top(button), "y", 175,82,232.18,12.2,.64,32)
    rim(top(dark), "y", 175,82,232.38,6.0,6.8,.24,32)
    block(top(silk), (82,232.40,175), (1.0,.16,4.0), .35, "y")
    for z, width in ((150.3,12.8),(134.1,8.1)):
        block(top(dark), (82,232.44,z), (4.5,.12,width), 1.6, "y")
        block(top(clamp), (82,232.48,z), (.55,.04,width-2.4), .25, "y")
    disc(top(dark), "y", 119,82,232.43,3.8,.14,16)
    top.finish()

    side = Part("right-panel", root)
    block(side(steel), (111.25,11.7,0), (2.5,422.5,411.7), 3.5, "x")
    for y in (-198.8,222.0):
        block(side(edge), (109.8,y,0), (4.2,3.9,405.6), .75, "x")
    side.finish()

    glass = Part("glass", root)
    panel_outline = rounded_outline(355.2,413.8,2.2,46.1,-.1,6)
    prism(glass(glass_m), "x", panel_outline, -111.85,-110.10)
    for y in (-129.45,221.65):
        block(glass(dark), (-111.7,y,-.1), (1.6,3.55,413.8), .6, "x")
    for z in (-205.25,205.05):
        block(glass(dark), (-111.7,46.1,z), (1.6,349.5,3.50), .6, "x")
    for z in (-198.,198.):
        block(glass(steel), (-108.3,213.4,z), (5,7.4,14.3), .95, "x")
        block(glass(steel), (-108.3,-120.9,z), (5,6.2,14.3), .90, "x")
    glass.finish()

    lower = Part("vented-psu-chamber", root)
    for y in (-201.8,-133.9):
        block(lower(edge), (-109.9,y,0), (4.6,3.2,410.0), .9, "x")
    for z in (-203.8,203.8):
        block(lower(steel), (-109.8,-167.5,z), (4.4,66.5,3.9), .75, "x")
    perforations(lower(mesh_steel), "x", -167.7,0,65.0,405.0,-112.5,11,62,.37,reverse=True)
    for x in (-102,99):
        block(lower(inner), (x,-132.2,0), (18.2,2.2,405.6), 1.2, "y")
    for z in (-197.2,-65.5,65.5,197.2):
        block(lower(inner), (0,-132.2,z), (188.,2.4,8.5), 1.35, "y")
    for z in (-106., 35.):
        perforations(lower(mesh_steel), "y", z, -32, 119,116,-131.1,18,18,.38)
        empty("mount-bottom-fan", (-32,-130.9,z), root)
    lower.finish()

    tray = Part("motherboard-tray", root)
    tray_panel(tray(inner),"x",(92,-82,128,132),(-129,211,-201,130),72.6,75.0)
    for y, z in [(201,-179),(198,-44),(198,35),(89,-179),(89,-45),(89,35),(-74,-179),(-74,-45),(-74,35)]:
        disc(tray(screw),"x",y,z,72.3,4.5,4.9,16)
        disc(tray(dark),"x",y,z,69.7,1.4,.32,12)
    for y in (-98,-37,25,77,160,204):
        block(tray(dark),(72.54,y,115),(0.8,10.8,2.9),.9,"x")
    for y in (-99.5,-40,20,80,140):
        block(tray(steel),(63.5,y,117),(18.3,5.2,8.9),1.2,"x")
    block(tray(edge), (54.3,40,123.0), (4.8,360,46.1), 5.2, "x")
    block(tray(steel), (57.9,40,143.7), (10.9,360,6.2), 2.6, "x")
    for z in (-181., -87., 19., 113.):
        block(tray(edge),(74.0,210,z),(4.2,6.1,28.0),1.52,"x")
    tray.finish()

    rear = Part("rear-expansion-and-ventilation", root)
    for x in (-105.5,105.5):
        block(rear(rear_m),(x,9.0,-211.6),(12.2,439.0,6.8),1.7)
    for y in (-208.2,221.6):
        block(rear(rear_m),(0,y,-211.6),(223.4,10.,6.8),1.7)
    block(rear(rear_m),(91,38,-211.6),(24,361,6.8),2)
    block(rear(rear_m),(49,20,-211.6),(12,359,6.8),1.6)
    block(rear(rear_m),(-26, 69,-212.0),(139,8,5),1.2)
    perforations(rear(mesh_steel), "z", -29.7,144.1,125,135,-214.6,20,22,.40,reverse=True)
    for x in (-81,23):
        for y in (91.7,196.5):
            disc(rear(screw),"z",x,y,-214.8,5.0,.4,20)
    for i in range(7):
        y = 52.0 - i*20.3
        block(rear(rear_m),(-29,y,-214.0),(128,16.7,1.1),1.0)
        for x in range(-83,28,9):
            block(rear(dark),(x,y,-214.65),(4.4,8.2,.2),.95)
        disc(rear(screw),"z",37,y,-214.7,4.0,.6,16)
    block(rear(rear_m), (13,-113,-212.3),(199,15.4,5.4),1.3)
    for x in (-86.0, 83.0):
        block(rear(rear_m),(x,-169.4,-211.6),(18.3,72.0,6.8),1.5)
    block(rear(rear_m),(5,-206.4,-211.6),(181,10.3,6.8),1.5)
    rear.finish()

    empty("mount-rear-fan", (-29.7,144.1,-206.5), root)
    empty("mount-top-fan-0", (-27,224.9,-79), root)
    empty("mount-top-fan-1", (-27,224.9,57), root)
    empty("mount-mainboard-datum", (70,198,-175), root)
    empty("mount-psu", (18,-169,-207), root)
    return root


def cameras_and_lighting(target, camera_position, ortho):
    scene = bpy.context.scene
    camera_data = bpy.data.cameras.new("Product portrait")
    camera = bpy.data.objects.new("Product portrait", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = xyz(camera_position)
    direction = Vector(xyz(target)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ortho
    scene.camera = camera

    for name, position, power, size, color in [
        ("Key softbox", (-440,420,330), 35, .51, (1.0,.93,.84)),
        ("Cool face fill", (-510,-35,180), 26, .42, (.69,.79,1.0)),
        ("Top directional softbox", (230,460,-230), 38, .35, (.73,.80,1.0)),
        ("Front edge strip", (210,12,480), 31, .29, (.85,.90,1.0)),
        ("Low fill", (0,-230,-120), 13, .28, (.83,.85,1.0)),
    ]:
        data = bpy.data.lights.new(name, "AREA")
        light = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(light)
        light.location = xyz(position)
        light.rotation_euler = (Vector(xyz(target))-light.location).to_track_quat("-Z", "Y").to_euler()
        data.energy = power
        data.shape = "DISK"
        data.size = size
        data.color = color

    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.eevee.taa_render_samples = 20
    scene.world = bpy.data.worlds.new("Studio ambient")
    scene.world.color = (.20,.20,.20)
    scene.render.film_transparent = True
    scene.render.resolution_x = 550
    scene.render.resolution_y = 550
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.exposure = -2.2


def save(identifier, build, camera_position, ortho):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    build()
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / (identifier + ".glb")),
                              export_format="GLB", export_extras=True,
                              export_cameras=False, export_lights=False,
                              export_animations=False, export_yup=True)
    if GENERATION_RENDER:
        cameras_and_lighting((0,0,0), camera_position, ortho)
        out = Path("/tmp/lumo-model-renders")
        out.mkdir(parents=True, exist_ok=True)
        bpy.context.scene.render.filepath = str(out / f"{identifier}.png")
        bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    save(GPU_ID, make_gpu, (-300,-348,320), .355)
    save(CASE_ID, make_case, (-640,290,550), .667)
