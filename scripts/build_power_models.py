"""Rebuild original exterior geometry for Corsair PSU variants."""

from dataclasses import dataclass
from functools import partial
from math import pi
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_internal_models import STROKES
from build_product_models import (Part, block, disc, empty, label, material, perforations,
                                  rail, rim, save, tapered_blade)


@dataclass(frozen=True)
class Supply:
    identifier: str
    model: str
    name: str
    width: float
    height: float
    depth: float
    fan: int
    connectors: tuple[int,...]
    sfx: bool = False


SUPPLIES = (
    Supply("corsair-rm650e","CP-9020302-NA","RM650E",150,86,140,120,(10,18,8,16,6,6)),
    Supply("corsair-rm750e-2023","CP-9020262-NA","RM750E",150,86,140,120,(10,18,8,8,8,8,6,6,6)),
    Supply("corsair-rm1000e-2023","CP-9020264-NA","RM1000E",150,86,140,120,(10,18,8,8,8,8,8,8,6,6,6)),
    Supply("corsair-sf750-2024","CP-9020284-NA","SF750",125,63.5,100,92,(10,18,8,8,8,8,6,6),True),
)


def psu_exterior(spec):
    g = empty(spec.model)
    g["provenance"] = "Original approximate exterior with product-specific dimensions and illustrated ports"
    metal = material("psu-case-powder-coat", (.028,.033,.04),.44,.54)
    rim_m = material("psu-rolled-frame", (.055,.060,.071),.53,.47)
    vents = material("psu-punch-grid", (.061,.069,.088),.65,.48)
    body = material("psu-insulator", (.017,.020,.024),.10,.62)
    blades = material("psu-blades", (.040,.042,.047),.14,.45)
    contact = material("psu-socket-contact", (.40,.28,.12),.71,.41)
    label_m = material("psu-product-label", (.44,.47,.52),.31,.45)
    x,y,z = spec.width/2,spec.height/2,spec.depth/2
    shell = Part("modular-psu-shell",g)
    for side in (-1,1):
        block(shell(metal),(side*(x-.86),0,0),(1.72,spec.height,spec.depth),1.8,"x")
    block(shell(metal),(0,-y+.80,0),(spec.width-3.4,1.6,spec.depth),1.35,"y")
    for lip in (-1,1):
        block(shell(rim_m),(0,y-.84,lip*(z-3)),(spec.width-1.2,1.67,6),1.45,"y")
    perforations(shell(vents),"y",0,0,spec.depth-10,spec.width-17,y,20,23,.40)

    pz = -z+.75
    block(shell(metal),(-x+22.1,0,pz),(44.2,spec.height-4.2,1.5),2.6)
    for band in (-1,1):
        block(shell(rim_m),(20.4,band*(y-2.1),pz),(spec.width-51,4,1.5),1.22)
    perforations(shell(vents),"z",21.2,0,spec.width-49,spec.height-9.3,-z+.06,17,13,.415,reverse=True)
    block(shell(body),(-x+22,3.7,-z+.21),(26.6,18.5,.38),1.8)
    for u,v in [(-6.0,2.8),(6.0,2.8),(0,-3.1)]:
        block(shell(contact),(-x+22+u,3.7+v,-z+.09),(1.3,3.4,.16),.36)
    block(shell(body),(-x+22,20.5,-z+.24),(14.6,8.8,.40),1.09)
    rail(shell(label_m),"z",[(-x+18,20.5),(-x+20,20.5)],-z+.04,.36,.077)

    plate = Part("modular-ports",g)
    block(plate(metal),(0,0,z-.71),(spec.width-3.4,spec.height-3.3,1.42),2.4)
    row_count = 3 if len(spec.connectors)>8 else 2
    cols = 4
    base_step = (spec.width-38)/(cols-1)
    ys = [spec.height*((row_count-1)/2-i)*.282 for i in range(row_count)]
    for i,n in enumerate(spec.connectors):
        yy = ys[i//cols]
        xx = -1.5 + (i%cols-(cols-1)/2)*base_step
        width = min(base_step-2.2,n*2.37+3.1)
        block(plate(body),(xx,yy,z-.09),(width,13.8,.18),1.02)
        for row in (-1,1):
            for col in range(n//2):
                pin_step = (width-5)/(max(1,n//2-1))
                pin_x = xx + (col-(n//2-1)/2)*pin_step
                block(plate(rim_m),(pin_x,yy+row*2.65,z-.032),
                      (min(2.32, pin_step*.73),2.15,.052),.34)
    plate.finish()

    left = -x
    ordinary = min(13.1,spec.height*.194)
    label(shell(label_m),spec.name,(left+.34,-.6,-z*.58),(0,0,1),(0,1,0),ordinary,.64)
    label(shell(label_m),"CORSAIR",(left+.145,-13,-z*.56),(0,0,1),(0,1,0),4.15,.27)
    shell.finish()

    rotor = Part("rotor-0",g,(0,y-8.35,0))
    rotor.node["axis"] = "y"
    fan_radius = spec.fan*.475
    for blade in range(7 if not spec.sfx else 9):
        tapered_blade(rotor(blades),blade*2*pi/(7 if not spec.sfx else 9),fan_radius,-1)
    disc(rotor(body),"y",0,0,0,fan_radius*.64,5.4,40)
    rim(rotor(rim_m),"y",0,0,2.72,fan_radius*.27,fan_radius*.292,.14,36)
    rotor.finish()
    empty("mount-sfx-psu" if spec.sfx else "mount-atx-psu",(0,0,-z),g)
    return g


if __name__ == "__main__":
    flags = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    chosen = {flag for flag in flags if not flag.startswith("--")}
    for supply in SUPPLIES:
        if not chosen or supply.identifier in chosen:
            save(supply.identifier,partial(psu_exterior,supply),(-205,156,226),.235)
