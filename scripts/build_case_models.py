"""Author original enclosures from published unit envelopes and reference views."""

from dataclasses import dataclass
from functools import partial
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_product_models import (Part, block, disc, empty, label, material,
                                  perforations, save, tray_panel)


@dataclass(frozen=True)
class Chassis:
    identifier: str
    model: str
    width: float
    height: float
    depth: float
    top_lip: float
    foot_height: float
    glass_front_gap: float
    pan_height: float
    front_bottom: float
    expansion_slots: int
    front_fans: int
    glass_alpha: float


H7 = Chassis("nzxt-h7-flow-2024", "CM-H72FB-01", 244, 544, 468, 4.5, 22, 10, 110, 24, 7, 3, .15)
CORSAIR = Chassis("corsair-4000d-airflow", "CC-9011200-WW", 230, 466, 453, 6.0, 22, 37, 100, 23, 7, 3, .19)
NORTH = Chassis("fractal-north", "FD-C-NOR1C-02", 215, 469, 447, 7.0, 19, 64, 101, 23, 7, 2, .20)
POP = Chassis("fractal-pop-mini-air", "FD-C-POR1M-06", 215, 393, 432, 4.5, 16, 15, 93, 85, 4, 2, .09)
CASES = (H7, CORSAIR, NORTH, POP)


def triangle_screen(mesh, width, height, center_y, z, columns, rows, opening=.75):
    dx, dy = width / columns, height / rows
    for row in range(rows):
        for column in range(columns):
            u = -width / 2 + column * dx
            v = center_y - height / 2 + row * dy
            split = ((0,0),(1,0),(0,1)), ((1,0),(1,1),(0,1))
            if (row+column) % 2:
                split = ((0,0),(1,0),(1,1)), ((0,0),(1,1),(0,1))
            for outline in split:
                center_u = sum(x for x,_ in outline) / 3
                center_v = sum(y for _,y in outline) / 3
                outside = [(u + x*dx, v + y*dy, z) for x,y in outline]
                aperture = [(u + (center_u+(x-center_u)*opening)*dx,
                             v + (center_v+(y-center_v)*opening)*dy, z) for x,y in outline]
                for i in range(3):
                    j = (i+1) % 3
                    mesh.face((outside[i], outside[j], aperture[j], aperture[i]))


def apertured_side(mesh, width, height, center_u, center_v, x):
    perforations(mesh, "x", center_u, center_v, width, height, x, 12, 72, .38, reverse=True)


def front_panel(spec, g, coated, lip, vent, steel, dark, accents):
    width, depth, height = spec.width, spec.depth, spec.height
    x, y, z = width/2, height/2, depth/2
    low = -y+spec.foot_height
    front = Part("front-panel", g)

    # Each enclosure has a different fascia depth, lower insert and filter.
    thick = 10 if spec is NORTH else 6.8
    side_rail = 9.0 if spec in (CORSAIR, NORTH) else 5.0
    outer_bottom = low + (2 if spec is NORTH else 0)
    for side in (-1,1):
        block(front(coated), (side*(x-side_rail/2), (y+outer_bottom)/2, z-thick/2),
              (side_rail,y-outer_bottom,thick), 2.2 if spec is NORTH else 1.2, "z")
    block(front(lip), (0,y-spec.top_lip*.54,z-thick/2),
          (width-2.0,spec.top_lip,thick), 1.5, "z")
    low_rail_height = 10 if spec is NORTH else (66 if spec is POP else 14)
    block(front(coated), (0,outer_bottom+low_rail_height/2,z-thick/2),
          (width-2.0,low_rail_height,thick), 2, "z")
    lower = -y + spec.front_bottom + (4 if spec is H7 else 6)
    upper = y-spec.top_lip-4.5
    active_height = upper-lower
    active_center = (upper+lower)/2
    clear_width = width - 2*(side_rail+2)

    if spec is NORTH:
        # Slim walnut fins in a matte enclosure, with a fine filter behind them.
        grains = [
            material(f"north-walnut-{i}", color, .03,.57+i*.025)
            for i,color in enumerate(((.13,.064,.033),(.108,.054,.029),(.149,.080,.044),
                                      (.118,.063,.034),(.163,.088,.050),(.139,.073,.040)))
        ]
        perforations(front(vent),"z",0,active_center,clear_width,active_height,z-8.8,31,67,.39)
        span = clear_width/10
        for index in range(10):
            u = -clear_width/2+(index+.5)*span
            block(front(grains[index % len(grains)]), (u,active_center,z-3.5),
                  (10.1,active_height-1.3,6.5),1.35,"z")
            for band, offset in enumerate((-2.8,-1.1,2.2)):
                m = grains[(index+band+2) % len(grains)]
                block(front(m), (u+offset,active_center+(band-1)*30,z-.211),
                      (.22,active_height-64,0.045),.035,"z")
    elif spec is CORSAIR:
        triangle_screen(front(steel), clear_width-.5,active_height,active_center,z-.8,14,27,.79)
        perforations(front(vent),"z",0,active_center,clear_width,active_height,z-4.9,24,51,.41)
        # Narrow gaps at the fascia edges allow the front piece to be removed.
        for side in (-1,1):
            block(front(dark),(side*(clear_width/2+1.12),active_center,z-.65),
                  (1.0,active_height+4,.65),.35,"z")
    elif spec is POP:
        perforations(front(vent),"z",0,active_center,clear_width,active_height,z-.5,34,52,.395)
        block(front(dark),(0,lower-1.65,z-.2),(clear_width+7,2.3,.5),.42,"z")
        block(front(lip),(x-5,-y+70,z-.4),(8.2,12.8,.6),.7,"z")
        block(front(steel),(x-4.7,-y+74,z-.10),(2.0,3.8,.2),.43,"z")
    else:
        perforations(front(vent),"z",0,active_center,clear_width,active_height,z-.35,39,82,.387)
        block(front(lip),(0,lower-2.0,z-.71),(clear_width+7,2.1,1.4),.55,"z")
        label(front(accents),"H7 FLOW",(-24,outer_bottom+4.8,z-.22),(1,0,0),(0,1,0),5.3,.44)
    front.finish()

    mount = Part("front-fan-carrier",g)
    mount_z = z - (29 if spec is NORTH else 20)
    mount_range_h = active_height - 15
    mount_range_x = 136 if spec is NORTH else 128
    for side in (-1,1):
        block(mount(steel),(side*(mount_range_x/2+6.8),active_center,mount_z),
              (17.8,mount_range_h+5,1.6),1.15,"z")
    pitch = 143 if spec is NORTH else (129 if spec is H7 else 120)
    center_fans_y = active_center + (8 if spec is POP else 0)
    for i in range(spec.front_fans + 1):
        y_bar = center_fans_y + (i-spec.front_fans/2)*pitch
        block(mount(steel),(0,y_bar,mount_z),(mount_range_x+32,8.3,2.2),1.28,"z")
    for i in range(spec.front_fans):
        fan_y = center_fans_y + (i-(spec.front_fans-1)/2)*pitch
        empty(f"mount-front-fan-{i}",(0,fan_y,mount_z-2.5),g)
        for side in (-1,1):
            block(mount(dark),(side*(mount_range_x/2+5),fan_y,mount_z+1.05),(2.8,35,1.1),.91,"z")
    mount.finish()


def rear_panel(spec, g, coated, lip, dark, vent, steel):
    x, y, z = spec.width/2, spec.height/2, spec.depth/2
    bottom = -y + spec.foot_height
    pan = -y + spec.pan_height
    rear = Part("rear-panel", g)
    for side in (-1,1):
        block(rear(coated),(side*(x-5.5),(y+bottom)/2,-z+4),(11,y-bottom,8),1.45,"z")
    block(rear(lip),(0,y-8,-z+3.5),(spec.width-2,15,7),1.5,"z")
    block(rear(lip),(0,bottom+5,-z+3.5),(spec.width-2,10,7),1.4,"z")
    io_x = x*.58
    fan_x = -x*.20
    fan_y = y - (107 if spec is H7 else 92)
    fan_diameter = 134 if spec is H7 else 120
    perforations(rear(vent),"z",fan_x,fan_y,fan_diameter,fan_diameter,-z+.15,19,20,.415,reverse=True)
    for u in (-.43,.43):
        for v in (-.43,.43):
            disc(rear(lip),"z",fan_x+u*fan_diameter,fan_y+v*fan_diameter,-z+.22,4.2,.44,16)
    io_y = y - 126.4
    for u in (-1,1):
        block(rear(steel),(io_x+u*26,io_y,-z+3),(3.3,161,6),.85,"z")
        block(rear(steel),(io_x,io_y+u*79.5,-z+3),(52,3.1,6),.85,"z")
    empty("mount-rear-fan",(fan_x,fan_y,-z+8.5),g)

    if spec is H7:
        psu_x, psu_y, psu_w, psu_h = x-52,pan-7,88,145
    else:
        psu_x, psu_y, psu_w, psu_h = 10,bottom+49,155,84
    for v in (-1,1):
        block(rear(steel),(psu_x,psu_y+v*psu_h/2,-z+2.9),(psu_w+8,9.2,5.8),1.36,"z")
    for u in (-1,1):
        block(rear(steel),(psu_x+u*psu_w/2,psu_y,-z+2.9),(9.2,psu_h,5.8),1.36,"z")
    for sx in (-1,1):
        for sy in (-1,1):
            disc(rear(dark),"z",psu_x+sx*psu_w*.45,psu_y+sy*psu_h*.47,-z+.2,3.95,.4,14)
    empty("mount-atx-psu",(psu_x,psu_y,-z+7),g)

    for index in range(spec.expansion_slots):
        yy = pan+18+19.9*index
        plate_width = 124 + (4 if spec is H7 else 0)
        block(rear(steel),(-27,yy,-z+2.8),(plate_width,16.9,5.6),1.24,"z")
        for j in range(12):
            block(rear(dark),(-27 + (j-5.5)*9.1,yy,-z+.26),(6.1,3.75,.52),.68,"z")
        disc(rear(lip),"z",41,yy,-z+.33,4.7,.64,16)
    rear.finish()


def shell(spec):
    g = empty(spec.model)
    g["provenance"] = "Original approximation from published dimensional envelope and product views"
    graphite = (.025,.030,.038)
    if spec is NORTH:
        graphite = (.032,.031,.033)
    coated = material("case-shell-powder-coat", graphite,.40,.52)
    rail_m = material("case-edging", (.050,.057,.067),.55,.44)
    vent = material("case-mesh", (.039,.042,.051),.49,.60)
    steel = material("case-stamped-steel", (.049,.053,.060),.40,.51)
    dark = material("case-rubber", (.012,.016,.022),.14,.65)
    chrome = material("case-neutral-legend", (.22,.24,.27),.31,.44)
    brass = material("case-brass", (.45,.28,.12),.72,.43)
    glass_m = material("case-glass", (.22,.26,.34),.03,.18,spec.glass_alpha)
    glass_m.use_backface_culling = False

    w,h,d = spec.width,spec.height,spec.depth
    x,y,z = w/2,h/2,d/2
    base = -y + spec.foot_height
    pan = -y + spec.pan_height
    ceiling = y - spec.top_lip
    tray_x = x - (36 if spec is H7 else 27)
    rear_panel(spec,g,coated,rail_m,dark,vent,steel)
    front_panel(spec,g,coated,rail_m,vent,steel,dark,chrome)

    chassis = Part("chassis-frame",g)
    for side in (-1,1):
        for corner_z in (-z+15,z-15):
            block(chassis(coated),(side*(x-5.5),(base+ceiling)/2,corner_z),
                  (9.4,ceiling-base,12.0),1.7,"z")
        for level in (base+4,ceiling-3.2):
            block(chassis(rail_m),(side*(x-5.15),level,0),(9.9,7.7,d-20),1.3,"x")
    if spec is NORTH:
        for side in (-1,1):
            for corner_z in (-z+35,z-35):
                disc(chassis(dark),"y",corner_z,side*(x-24),-y+8.7,29.4,17.4,32)
                disc(chassis(brass),"y",corner_z,side*(x-24),-y+2.0,29.9,4.0,32)
    else:
        foot_w = 34 if spec is CORSAIR else 26
        for side in (-1,1):
            for corner_z in (-z+23,z-23):
                block(chassis(coated),(side*(x-foot_w/2),-y+spec.foot_height*.54,corner_z),
                      (foot_w,spec.foot_height*.92,37),3.8,"y")
                block(chassis(dark),(side*(x-(foot_w+.15)/2),-y+1.15,corner_z),
                      (foot_w-.3,2.3,34),3.2,"y")
    for near_z in (-z+17,z-17):
        block(chassis(steel),(0,base+2,near_z),(w-18,4,16),2.2,"y")
    chassis.finish()

    top = Part("top-panel", g)
    front_io_length = 44 if spec in (CORSAIR,NORTH) else 33
    block(top(coated),(0,y-spec.top_lip/2,z-front_io_length/2),(w,spec.top_lip,front_io_length),1.9,"y")
    block(top(coated),(0,y-spec.top_lip/2,-z+6),(w,spec.top_lip,12),1.9,"y")
    for side in (-1,1):
        block(top(coated),(side*(x-5),y-spec.top_lip/2,-front_io_length*.34),(10,spec.top_lip,d-front_io_length-9),1.4,"y")
    perforations(top(vent),"y",-front_io_length*.36,0,d-front_io_length-19,w-22,y-.24,55,29,.378)
    if spec is NORTH:
        # The pull tab and brass-ring I/O are characteristic of this variant.
        block(top(dark),(0,y-.55,-z+18.2),(21.3,1.1,20.9),2.6,"y")
        disc(top(brass),"y",z-18,-x+27,y-.28,13.1,.56,32)
        disc(top(dark),"y",z-18,-x+27,y-.09,9.1,.18,32)
    else:
        disc(top(rail_m),"y",z-17,-x+26,y-.27,13.5,.54,32)
        disc(top(dark),"y",z-17,-x+26,y-.09,8.9,.18,32)
    port_z = z-17
    for port_index in range(2):
        xpos = -x+55+port_index*22
        block(top(dark),(xpos,y-.19,port_z),(13,0.38,5.8),.8,"y")
        block(top(chrome),(xpos,y-.075,port_z), (8.2,.15,1.24),.2,"y")
    disc(top(dark),"y",port_z,-x+101,y-.08,4.9,.16,16)
    top.finish()

    near, far = -z + 12, z - spec.glass_front_gap
    y_min = pan-1 if spec is POP else base + 12
    y_max = ceiling - 7
    if spec is H7:
        y_min = -y+spec.pan_height*.81
    if spec is NORTH:
        y_min += 4.0
    glass = Part("glass",g)
    glass_x = -x + 1.25
    block(glass(glass_m),(glass_x,(y_min+y_max)/2,(near+far)/2),
          (2.35,y_max-y_min,far-near),.9,"x")
    for p in (near+2.3,far-2.3):
        block(glass(dark),(glass_x-.94,(y_min+y_max)/2,p),
              (.62,y_max-y_min,4.6),.58,"x")
    for level in (y_min+2.4,y_max-2.4):
        block(glass(dark),(glass_x-.94,level,(near+far)/2),
              (.62,4.8,far-near),.58,"x")
    for pin_z in (near+7,far-7):
        disc(glass(rail_m),"x",y_max-7.2,pin_z,glass_x+.8,4.2,1.56,12)
    glass.finish()

    side = Part("right-panel",g)
    if spec is H7:
        # The PSU intake cuts through the right-side service panel.
        intake_y, intake_z = base + 104, -z + 105
        tray_panel(side(coated),"x",(intake_y,intake_z,121,183),
                   (base+.8,ceiling-.8,-z+9.5,z-9.5),x-2.3,x)
        perforations(side(vent),"x",intake_y,intake_z,121,183,x-.08,20,31,.39)
    else:
        block(side(coated),(x-1.15,(base+ceiling)/2,0),(2.3,ceiling-base-1.6,d-19),2.5,"x")
    side.finish()

    lower = Part("lower-side-and-psu-deck",g)
    if spec is H7:
        apertured_side(lower(vent),y_min-base-9.0,d-28,(y_min+base)/2,0,-x)
        for topz in (-z+17,-z+149,-z+281,z-27):
            block(lower(steel),(-31,base+20,topz),(170,4.1,8.5),1.4,"y")
        for xpos in (-92,39):
            block(lower(steel),(xpos,base+20,0),(9,4.1,d-42),1.4,"y")
        for i in range(3):
            empty(f"mount-bottom-fan-{i}",(-27,base+22,-134+130*i),g)
    else:
        z0, z1 = -z+19,z-21
        if spec is NORTH:
            block(lower(coated),(-x+1.6,(base+y_min)/2,0),(3.2,y_min-base,d-19),1.5,"x")
        elif spec is POP:
            block(lower(coated),(-x+1.6,(base+y_min)/2,0),(3.2,y_min-base,d-17),1.5,"x")
        else:
            block(lower(coated),(-x+2.0,base+4,0),(4,9,d-19),1.3,"x")
        block(lower(steel),(0,pan,(z0+z1)/2),(w-25,2.3,z1-z0),1.4,"y")
        if spec is POP:
            for off in (-20,20):
                block(lower(rail_m),(0,base+19+off*.12,z-74),(w-27,2.4,85),1.2,"y")
        for side in (-1,1):
            block(lower(dark),(side*(x-19),pan+.81,(z0+z1)/2),(5.9,.9,z1-z0-11),1.15,"y")
    if spec is NORTH:
        block(lower(coated),(-x+2.5,(base+ceiling)/2,(far+z-9)/2),
              (5,ceiling-base,z-far-9),2.05,"x")
    block(lower(steel),(0,base+2,0),(w-12,4.0,d-35),1.7,"y")
    lower.finish()

    tray = Part("motherboard-tray",g)
    tray_upper = y-30
    slot_height = 106 if spec is POP else 130
    slot_y = tray_upper-111
    tray_limit = (pan+4,tray_upper,-z+13,min(z-74,76))
    tray_panel(tray(steel),"x",(slot_y,-z+143,slot_height,124),tray_limit,tray_x-2.4,tray_x)
    for y_anchor in (tray_upper-17,tray_upper-120,pan+17):
        for z_anchor in (-z+43,-z+139,min(z-100,29)):
            disc(tray(rail_m),"x",y_anchor,z_anchor,tray_x-3.6,4.4,3.8,16)
    for y_cut in (pan+25,pan+88,pan+156,pan+218):
        if y_cut < tray_upper:
            block(tray(dark),(tray_x-2.5,y_cut,z-98),(1.0,13,4.5),1.15,"x")
    # Corsair's removable cable bar is its own narrow piece beside the ATX tray.
    if spec in (CORSAIR,H7):
        block(tray(coated),(tray_x-11, (pan+tray_upper)/2,z-103),
              (8.1,tray_upper-pan,36.4 if spec is CORSAIR else 43.0),4.0,"x")
    else:
        block(tray(rail_m),(tray_x-5.7,(pan+tray_upper)/2,z-83),(7.1,tray_upper-pan,24),3.0,"x")
    tray.finish()
    empty("mount-mainboard-datum",(tray_x-5, tray_upper-15,-z+35),g)
    for i in range(2 if spec is not H7 else 3):
        empty(f"mount-top-fan-{i}",(-24,ceiling-8,-140+i*120),g)
    return g


if __name__ == "__main__":
    flags = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    chosen = {flag for flag in flags if not flag.startswith("--")}
    for spec in CASES:
        if not chosen or spec.identifier in chosen:
            size = max(spec.height,spec.depth)/1000 * 1.36
            save(spec.identifier, partial(shell,spec),(-615,255,665),size)
