"""Build each AIO as two separately mountable product-specific GLB assemblies."""

from dataclasses import dataclass
from functools import partial
from math import pi
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_internal_models import STROKES
from build_product_models import (Part, block, disc, empty, label, material, prism,
                                  rail, rim, rounded_outline, save, tapered_blade)


@dataclass(frozen=True)
class Aio:
    identifier: str
    sku: str
    width: float
    length: float
    thickness: float
    fan_size: float
    fan_thickness: float
    fan_count: int
    pump_depth: float
    pump_width: float
    pump_length: float


KRAKEN = Aio("nzxt-kraken-240-rgb","RL-KR240-B2",120,281,27,120,26,2,55.97,72.95,72.95)
ARCTIC = Aio("arctic-liquid-freezer-iii-280-argb","ACFRE00143A",138,317,38,140,27,2,68.5,91,108.5)
CORSAIR = Aio("corsair-h150i-elite-capellix-xt","CW-9060070-WW",120,397,27,120,25,3,42,66,70)
MODELS = (KRAKEN, ARCTIC, CORSAIR)


def luminous(name, color):
    m = material(f"rgb zone {name}",color,.06,.28)
    shader = m.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Emission Color"].default_value = (*color,1)
    shader.inputs["Emission Strength"].default_value = .56
    return m


def fan(parent, index, spec, z, frame_m, rubber, nickel, neutral, led):
    rad = spec.fan_size/2
    y = -spec.thickness/2 - spec.fan_thickness/2
    frame = Part(f"radiator-fan-frame-{index}",parent,(0,y,z))
    for side in (-1,1):
        block(frame(frame_m),(side*(rad-2.35),0,0),(4.7,spec.fan_thickness,2*rad-2),1.7,"y")
        block(frame(frame_m),(0,0,side*(rad-2.35)),(2*rad-2,spec.fan_thickness,4.7),1.7,"y")
    rim(frame(frame_m),"y",0,0,0,rad-4.3,rad-.92,spec.fan_thickness-.75,52)
    for u in (-1,1):
        for v in (-1,1):
            px,pz = u*(rad-7.35),v*(rad-7.35)
            block(frame(rubber),(px,0,pz),(12.6,spec.fan_thickness,12.6),2.05,"y")
            disc(frame(nickel),"y",pz,px,-spec.fan_thickness/2+.18,4.2,.365,16)
    frame.finish()

    rotor = Part(f"rotor-{index}",parent,(0,y,z))
    rotor.node["axis"] = "y"
    count = 5 if spec is ARCTIC else (9 if spec is CORSAIR else 7)
    for i in range(count):
        tapered_blade(rotor(led),i*2*pi/count,rad-5.25,-1)
    disc(rotor(frame_m),"y",0,0,0,rad*.615,7.7,44)
    disc(rotor(neutral),"y",0,0,-3.97,rad*.51,.25,36)
    if spec is ARCTIC:
        rim(rotor(led),"y",0,0,.06,rad-6.36,rad-5.1,2.3,52)
    rotor.finish()


def radiator(root, spec, coated, rib_m, rubber, nickel, mark, shader):
    # Preview location only. The application applies the chassis-specific bracket transform.
    g = empty("radiator",(0,25,0),root)
    g["envelopeMm"] = {"x":spec.width, "y":spec.thickness, "z":spec.length}
    w,t,d = spec.width, spec.thickness, spec.length
    y,z = t/2,d/2
    body = Part("radiator-body",g)
    tank = (d-spec.fan_size*spec.fan_count)/2
    for side in (-1,1):
        block(body(coated),(side*(w/2-2.75),0,0),(5.5,t,d-2.5),1.2,"y")
        block(body(coated),(0,0,side*(z-tank/2)),(w,t,tank),3.3,"y")
        block(body(rubber),(side*(w/2-3.5),y-.795,0),(1.25,1.6,d-18),.28,"y")
    lanes = 12 if spec is ARCTIC else 11
    fin_width = (w-13.6)/lanes
    fin_span = d-2*tank-1.2
    for lane in range(lanes+1):
        block(body(coated),(-fin_width*lanes/2+lane*fin_width,0,0),
              (.65,t-3.0,fin_span),.18,"y")
    subdivisions = int(fin_span/2.85)
    for i in range(subdivisions):
        lead = -fin_span/2+i*fin_span/subdivisions
        for lane in range(lanes):
            u = (-lanes/2+lane)*fin_width
            offset = ((i+lane)%2)*.55
            path = [(lead+.05+offset,u+.30),(lead+.85+offset,u+fin_width*.53),
                    (lead+1.57+offset,u+fin_width-.29)]
            rail(body(rib_m),"y",path,y-.63,.47,1.1)
            rail(body(rib_m),"y",path,-y+.62,.44,1.07)
    for i in range(spec.fan_count+1):
        fan_z = (i-spec.fan_count/2)*spec.fan_size
        for side in (-1,1):
            disc(body(rubber),"y",fan_z,side*(w/2-6),y+.06,4.2,.12,16)
    body.finish()

    fittings = Part("radiator-barbs",g)
    for i in range(2):
        x = -w*.275+i*21.6
        disk_z = z+6.75
        disc(fittings(coated),"z",x,0,z+2.9,16.5,5.9,28)
        disc(fittings(rubber),"z",x,0,disk_z,13.4,4.6,28)
        rim(fittings(nickel),"z",x,0,z+8.4,4.25,6.1,1.55,23)
        empty(f"tube-radiator-{i}",(x,0,z+9.35),g)
    fittings.finish()
    for i in range(spec.fan_count):
        center = (i-(spec.fan_count-1)/2)*spec.fan_size
        fan(g,i,spec,center,coated,rubber,nickel,mark,shader)


def coolant_pump(root, spec, coated, dark, nickel, ribs, brass, mark, lit):
    g = empty("pump",(0,-91,0),root)
    height = spec.pump_depth
    width = spec.pump_width
    length = spec.pump_length
    g["mountEnvelopeMm"] = {"x":height,"y":width,"z":length}
    body = Part("pump-housing",g)
    body_plain = Part("cold-plate",g)
    plate = rounded_outline(55 if spec is not ARCTIC else 61,54,7.3)
    prism(body_plain(dark),"x",plate,-5.0,-1.0)
    prism(body_plain(brass),"x",rounded_outline(44,46,3.9),-1.3,0)
    for y in (-1,1):
        for z in (-1,1):
            disc(body_plain(nickel),"x",y*24.0,z*23.4,-1.45,3.4,1.2,12)
    body_plain.finish()

    if spec is KRAKEN:
        disc(body(coated),"x",0,0,-(height+3)/2,width,height-3,64)
        rim(body(ribs),"x",0,0,-height+4.2,width/2-2.9,width/2-.08,1.15,62)
        screen = 39.1 / 2**.5
        block(body(dark),(-height+.41,0,0),(.82,screen+6.8,screen+6.8),1.15,"x")
        block(body(lit),(-height+.19,0,0),(.38,screen,screen),.86,"x")
        for i in range(9):
            block(body(mark),(-height+.03,-8.4+i*1.9,-11.4),(.062,1.03,.34+i*.157),.025,"x")
        label(body(mark),"NZXT",(-height+.21,-25,-11.5),(0,0,1),(0,1,0),3.7,.30)
    elif spec is ARCTIC:
        a,b=width/2,length/2
        profile=[(-a,-b+15),(-a+13,-b),(a-18,-b),(a,-b+17),(a,b-19),
                 (a-18,b),(-a+13,b),(-a,b-16)]
        prism(body(coated),"x",profile,-height+3,-8.6)
        prism(body(ribs),"x",[(u*.96,v*.96) for u,v in profile],-height,-height+4.6,caps=False)
        rim(body(coated),"x",0,-7.0,-height+2.08,19.3,36.6,4.25,62)
        rim(body(lit),"x",0,-7.0,-height+.38,19.3,21.7,.75,48)
        disc(body(mark),"x",0,-7.0,-height+.55,20.9,1.0,40)
        for slope in (-1,1):
            for i in range(9):
                a, offset = slope*(24+1.97*i),-7+1.2*i
                rail(body(dark),"x",[(a,-27+offset),(a+1.2*slope,-14+offset)],-height+.02,.62,.2)
        axle=empty("vrm-fan-axle",(-height+5.0,0,-7.0),g)
        axle.rotation_euler.y=pi/2
        rotor=Part("rotor-9",axle)
        rotor.node["axis"]="y"
        for i in range(7):
            tapered_blade(rotor(lit),i*2*pi/7,18.80,-1)
        disc(rotor(ribs),"y",0,0,-1.2,15.4,2.9,35)
        rotor.finish()
    else:
        main = rounded_outline(width,length,8.8)
        prism(body(coated),"x",main,-height+3.0,-5.5)
        prism(body(ribs),"x",[(u*.98,v*.98) for u,v in main],-height+1.1,-height+3.2)
        prism(body(lit),"x",rounded_outline(width-7.1,length-7.1,7.0),-height,-height+1.14)
        prism(body(dark),"x",rounded_outline(40.8,41.2,5.2),-height+.015,-height+1.5)
        label(body(mark),"CORSAIR",(-height+.06,-3.2,-15.8),(0,0,1),(0,1,0),4.5,.33)
    body.finish()

    hoses = Part("pump-elbows",g)
    for i in range(2):
        x = -height*.47
        y = -10.9 + i*21.8
        z = length/2+6
        disc(hoses(coated),"z",x,y,z-4.5,16.2,9.0,28)
        disc(hoses(dark),"z",x,y,z+1.7,13.2,6.1,26)
        rim(hoses(nickel),"z",x,y,z+4.35,4.43,6.25,1.12,22)
        empty(f"tube-pump-{i}",(x,y,z+5.1),g)
    hoses.finish()
    empty("mount-cpu-cold-plate",(0,0,0),g)


def make_model(spec):
    g = empty(spec.sku)
    g["provenance"] = "Original approximation from product specifications and enclosure views"
    black = material("aio-powder-coat",(.025,.031,.039),.43,.47)
    dark = material("aio-fibre-sleeve-and-rubber",(.018,.023,.030),.13,.59)
    matte = material("aio-graphite",(.044,.055,.074),.31,.39)
    fins = material("aio-folded-aluminium",(.075,.087,.101),.63,.50)
    silver = material("aio-fastener",(.24,.28,.35),.73,.35)
    cold = material("aio-milled-copper",(.39,.22,.115),.72,.34)
    ink = material("aio-hub-label",(.17,.19,.25),.31,.49)
    fan_tint = (.61,.48,.87) if spec is not CORSAIR else (.68,.54,.88)
    p_tint = (.060,.14,.33) if spec is KRAKEN else (.48,.34,.78)
    fan_rgb = luminous("fan-diffuser",fan_tint)
    pump_rgb = luminous("pump-cover",p_tint)
    radiator(g,spec,black,fins,dark,silver,ink,fan_rgb)
    coolant_pump(g,spec,black,dark,silver,matte,cold,ink,pump_rgb)
    return g


if __name__ == "__main__":
    flags = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    chosen = {flag for flag in flags if not flag.startswith("--")}
    for spec in MODELS:
        if not chosen or spec.identifier in chosen:
            save(spec.identifier,partial(make_model,spec),(-380,-158,420),max(.42,spec.length/800))
