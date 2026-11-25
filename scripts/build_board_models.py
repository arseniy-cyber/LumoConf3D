"""Build six original position-calibrated motherboard visualizations."""

from dataclasses import dataclass
from functools import partial
from math import cos, pi, sin
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_product_models import Part, STROKES, block, disc, empty, label, material, panel_plane, prism, rail, rim, save

STROKES.update({
    "0": [[(.16,0),(0,.16),(0,.84),(.16,1),(.84,1),(1,.84),(1,.16),(.84,0),(.16,0)]],
    "2": [[(0,.78),(.22,1),(.82,1),(1,.81),(1,.65),(0,0),(1,0)]],
    "3": [[(0,1),(.80,1),(1,.81),(1,.66),(.81,.5),(.45,.5),(.81,.5),(1,.34),(1,.16),(.81,0),(0,0)]],
    "6": [[(.9,.94),(.75,1),(.24,1),(0,.69),(0,.22),(.23,0),(.77,0),(1,.19),(1,.44),(.79,.59),(0,.59)]],
    "7": [[(0,1),(1,1),(.43,0)]],
    "9": [[(.1,.06),(.29,0),(.73,0),(1,.25),(1,.78),(.77,1),(.23,1),(0,.78),(0,.61),(.23,.43),(1,.43)]],
    "B": [[(0,0),(0,1),(.76,1),(1,.79),(1,.66),(.76,.52),(0,.52),(.77,.52),(1,.35),(1,.17),(.77,0),(0,0)]],
    "D": [[(0,0),(0,1),(.74,1),(1,.72),(1,.28),(.74,0),(0,0)]],
    "I": [[(0,0),(1,0)],[(0,1),(1,1)],[(.5,0),(.5,1)]],
    "K": [[(0,0),(0,1)],[(1,1),(0,.45),(1,0)]],
    "M": [[(0,0),(0,1),(.5,.45),(1,1),(1,0)]],
    "N": [[(0,0),(0,1),(1,0),(1,1)]],
    "P": [[(0,0),(0,1),(.81,1),(1,.84),(1,.65),(.81,.51),(0,.51)]],
    "Z": [[(0,1),(1,1),(0,0),(1,0)]],
})


@dataclass(frozen=True)
class Board:
    identifier: str
    name: str
    chipset: str
    socket: str
    memory: str
    height: float
    family: str
    m2: int
    sata: int
    pcie: tuple[tuple[float, bool], ...]
    source: str


MSI = "https://www.msi.com/Motherboard"
BOARDS = [
    Board("msi-pro-b760m-a-wifi-ddr4","PRO B760M-A WIFI DDR4","B760","LGA1700","DDR4",243.84,"pro",2,4,
          ((-.18,True),(-.356,False),(-.426,True)),f"{MSI}/PRO-B760M-A-WIFI-DDR4"),
    Board("msi-mag-b760-tomahawk-wifi","MAG B760 TOMAHAWK WIFI","B760","LGA1700","DDR5",304.8,"mag",3,4,
          ((-.18,True),(-.327,False),(-.397,True)),f"{MSI}/MAG-B760-TOMAHAWK-WIFI"),
    Board("msi-mag-z790-tomahawk-wifi","MAG Z790 TOMAHAWK WIFI","Z790","LGA1700","DDR5",304.8,"mag",4,7,
          ((-.18,True),(-.326,False),(-.401,True)),f"{MSI}/MAG-Z790-TOMAHAWK-WIFI"),
    Board("asus-tuf-b550-plus-wifi-ii","TUF GAMING B550-PLUS WIFI II","B550","AM4","DDR4",304.8,"tuf",2,6,
          ((-.18,True),(-.235,False),(-.286,False),(-.352,True),(-.415,False)),
          "https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-b550-plus-wifi-ii/"),
    Board("msi-mag-b650-tomahawk-wifi","MAG B650 TOMAHAWK WIFI","B650","AM5","DDR5",304.8,"mag",3,6,
          ((-.18,True),(-.313,False),(-.409,True)),f"{MSI}/MAG-B650-TOMAHAWK-WIFI"),
    Board("msi-pro-b650m-a-wifi","PRO B650M-A WIFI","B650","AM5","DDR5",243.84,"pro",2,4,
          ((-.18,True),(-.329,True)),f"{MSI}/PRO-B650M-A-WIFI"),
]
WIDTH = 243.84


def colors(board):
    trim = (.135,.147,.160) if board.family=="pro" else (.071,.082,.095) if board.family=="mag" else (.082,.094,.105)
    return {
        "pcb":material("black-layered-fr4",(.022,.027,.028),.16,.57),
        "laminate":material("etched-circuit-lines",(.067,.074,.068),.34,.55),
        "gold":material("gold-contact-plating",(.47,.31,.11),.73,.42),
        "silk":material("board-silkscreen-grey",(.30,.33,.32),.07,.54),
        "cream":material("ceramic-parts-and-silk",(.24,.24,.185),.17,.56),
        "silver":material("satin-stainless",(.33,.37,.40),.81,.35),
        "guard":material("alloy-structured-heatsink",trim,.73,.43),
        "edge":material("milled-heatsink-edge",tuple(x*1.40 for x in trim),.65,.34),
        "cavity":material("socket-dimensional-black",(.01,.014,.017),.15,.53),
        "body":material("reinforced-header-polymer",(.044,.049,.053),.13,.58),
        "mask":material("rear-io-shield",(.055,.063,.069),.62,.46),
        "blue":material("usb-3-dielectric-blue",(.014,.075,.23),.18,.49),
        "red":material("usb-superspeed-red",(.26,.026,.04),.19,.46),
        "yellow":material("tuf-silkscreen-ochre",(.50,.33,.084),.24,.48),
        "led":material("Motherboard RGB zone",(.26,.15,.057),.19,.32),
    }


def plated_panel(mesh, u, v, left, right, bottom, top, radius):
    outer,inner = [],[]
    for i in range(28):
        angle = i*2*pi/28
        a,b = cos(angle),sin(angle)
        u_edge = ((right if a>0 else left)-u)/a if abs(a)>.001 else 1e5
        v_edge = ((top if b>0 else bottom)-v)/b if abs(b)>.001 else 1e5
        scale = min(u_edge,v_edge)
        outer.append((u+scale*a,v+scale*b))
        inner.append((u+radius*a,v+radius*b))
    for i in range(28):
        j=(i+1)%28
        prism(mesh,"x",[outer[i],outer[j],inner[j],inner[i]],-.80,.80)


def pcb(root, board, mats):
    h,w=board.height,WIDTH
    part=Part("pcb-smd-silkscreen-and-mounting-holes",root)
    y_mounts=[-h/2+10.16, 0, h/2-10.16]
    z_mounts=[-w/2+11.43, w*.105, w/2-10.16]
    y_splits=[-h/2,(y_mounts[0]+y_mounts[1])/2,(y_mounts[1]+y_mounts[2])/2,h/2]
    z_splits=[-w/2,(z_mounts[0]+z_mounts[1])/2,(z_mounts[1]+z_mounts[2])/2,w/2]
    holes = {(0,0),(0,2),(1,0),(1,2),(2,0),(2,2),(2,1)}
    if h>300:
        holes.update({(0,1),(1,1)})
    for row,u in enumerate(y_mounts):
        for column,v in enumerate(z_mounts):
            left,right=y_splits[row:row+2]
            lo,hi=z_splits[column:column+2]
            if (row,column) in holes:
                plated_panel(part(mats["pcb"]),u,v,left,right,lo,hi,1.65)
                for surface in (-.84,.84):
                    rim(part(mats["gold"]),"x",u,v,surface,1.70,3.18,.08,22)
                empty(f"standoff-{row}-{column}",(.83,u,v),root)
            else:
                prism(part(mats["pcb"]),"x",[(left,lo),(right,lo),(right,hi),(left,hi)],-.8,.8)

    for i in range(42):
        y = -h*.45 + i*h*.9/41
        start = -w*.34 + (i%7)*3.7
        offset = -7.6 + (i%9)*1.65
        depth = w*.34 - (i%5)*6.4
        trace=[(y,start),(y,-w*.12),(y+offset,w*.04),(y+offset,depth)]
        if i%3==0:
            trace=[(a,-b) for a,b in trace]
        rail(part(mats["laminate"]),"x",trace,-.825,.27,.04)
        rail(part(mats["laminate"]),"x",trace,.845,.19,.05)
        for j in range(2):
            y1=y+2.1*j
            z1=depth+j*3.7
            disc(part(mats["gold"]),"x",y1,z1,-.867,1.10,.12,7)
            block(part(mats["cream"]),(-1.25,y1,z1-2.6),(.83,1.17,2.03),.17,"x")
    for i in range(9):
        block(part(mats["cavity"]),(-2.15,-h*.27+i*5.5,-w*.44),(2.45,3.3,5.9),.35,"x")
    label(part(mats["silk"]),board.chipset,(-.89,-h*.41,-w*.41),(0,0,1),(0,1,0),7.5,.42)
    part.finish()


def frame_panel(mesh, center, height,width,low,high,margin=3):
    y,z=center
    for lo,hi in [(-height/2,-height/2+margin),(height/2-margin,height/2)]:
        prism(mesh,"x",[(y+lo,z-width/2),(y+hi,z-width/2),(y+hi,z+width/2),(y+lo,z+width/2)],low,high)
    for lo,hi in [(-width/2,-width/2+margin),(width/2-margin,width/2)]:
        prism(mesh,"x",[(y-height/2+margin,z+lo),(y+height/2-margin,z+lo),
              (y+height/2-margin,z+hi),(y-height/2+margin,z+hi)],low,high)


def cpu_socket(root,board,mats):
    h,w=board.height,WIDTH
    y,z=h*.21,-w*.082
    part=Part(f"cpu-{board.socket.lower()}-retention-assembly",root)
    lga = board.socket!="AM4"
    foot_height,foot_width = (46.6,57) if board.socket=="LGA1700" else (52,53)
    block(part(mats["body"]),(-2.6,y,z),(3.75,foot_height,foot_width),1.9,"x")
    plate=mats["silver"] if lga else mats["guard"]
    frame_panel(part(plate),(y,z),foot_height-3,foot_width-3,-6.68,-4.42,3.1)
    length = 36 if lga else 40
    block(part(mats["cavity"]),(-4.39,y,z),(.38,length,39.5),.52,"x")
    for row in range(18):
        for column in range(18):
            if ((row in (0,17) and column<2) or (row in (8,9) and column in (8,9))):
                continue
            a,b=y+(row-8.5)*1.72,z+(column-8.5)*1.87
            disc(part(mats["gold"] if lga else mats["cavity"]),"x",a,b,-4.64,.61,.14,6)
    block(part(plate),(-5.4,y+foot_height/2+1.0,z),(3.6,6.5,foot_width*.74),1.0,"x")
    latch=[(y+foot_height/2+1.5,z-foot_width/2-5.3),(y-foot_height*.44,z-foot_width/2-5.3),
           (y-foot_height*.5,z-foot_width/2-2.2)]
    rail(part(mats["silver"]),"x",latch,-6.3,2.15,1.38)
    if board.socket in {"AM4","AM5"}:
        for sign in (-1,1):
            block(part(mats["body"]),(-4.8,y,z+sign*40.0),(8.0,67.5,7.5),1.35,"x")
            for a in (-29,29):
                disc(part(mats["silver"]),"x",y+a,z+sign*40.0,-8.93,4.7,.38,18)
    else:
        for a in (-37.5,37.5):
            for b in (-37.5,37.5):
                rim(part(mats["silver"]),"x",y+a,z+b,-.915,1.75,2.7,.20,18)
    part.finish()
    empty("mount-cpu-socket",(-6.7,y,z),root)


def dimm_slots(root,board,mats):
    y,w=board.height*.20,WIDTH
    ram=Part("four-dimm-channels",root)
    for index in range(4):
        z = w*.15 + index*10.5
        block(ram(mats["body"]),(-4.8,y,z),(7.9,133.3,7.1),.63,"x")
        block(ram(mats["cavity"]),(-8.837,y,z),(.22,126.5,2.73),.27,"x")
        for i in range(56):
            a=y+(i-27.5)*2.09
            notch=12 if board.memory=="DDR5" else -7.2
            if abs(a-(y+notch))<2.1:
                continue
            for sign in (-1,1):
                block(ram(mats["gold"]),(-8.95,a,z+sign*.91),(.19,.47,.25),0,"x")
        for sign in (-1,1):
            block(ram(mats["guard"] if board.family=="pro" else mats["body"]),(-7.25,y+sign*65.75,z),
                  (6.2,6.9,7.85),.82,"x")
        empty(f"mount-dimm-{index}",(-9.04,y,z),root)
    ram.finish()


def milled_heatsink(part,mats,y,z,length,width,height,strip=False):
    outline=[(y-length/2,z-width/2+3),(y-length/2+3,z-width/2),(y+length/2-5,z-width/2),
             (y+length/2,z-width/2+5),(y+length/2,z+width/2-3),(y+length/2-3,z+width/2),
             (y-length/2+5,z+width/2),(y-length/2,z+width/2-5)]
    prism(part(mats["guard"]),"x",outline,-height,-1.12)
    spacing=4.4 if strip else 5.2
    count=max(2,int((width if strip else length)/spacing)-1)
    for i in range(count):
        shift=((i+1)/(count+1)-.5)*(width-9 if strip else length-9)
        profile=[(y-length*.44,z+shift),(y+length*.36,z+shift)] if strip else [
            (y+shift,z-width*.42),(y+shift,z+width*.1),(y+shift+2.8,z+width*.40)]
        rail(part(mats["edge"]),"x",profile,-height-.15,.89,1.37)


def thermal_components(root,board,mats):
    h,w=board.height,WIDTH
    top=Part("vrm-power-stages-and-heat-spreaders",root)
    z= -w*.357 if board.family!="pro" else -w*.339
    milled_heatsink(top,mats,h*.298,z,h*.39,47.5,27.6 if board.family=="mag" else 23.8)
    milled_heatsink(top,mats,h*.405,-w*.101,h*.111,95.6 if board.family=="mag" else 78.5,17.3,True)
    for i in range(9):
        y=h*.09+i*8.1
        block(top(mats["body"]),(-2.8,y,-w*.243),(3.4,5.6,6.45),.72,"x")
        disc(top(mats["silver"]),"x",y,-w*.212,-4.0,5.0,5.7,16)
        disc(top(mats["cavity"]),"x",y,-w*.212,-6.96,3.9,.28,12)
    for i in range(7):
        label_y=h*.347
        label_z=-w*.18+i*7.25
        block(top(mats["body"]),(-2.8,label_y,label_z),(4.0,6.25,5.7),.69,"x")
    fashion=("MAG" if board.family=="mag" else "PRO" if board.family=="pro" else "TUF")
    label(top(mats["silk"]),fashion,(-28.15 if board.family=="mag" else -24.45,h*.34,z-12.0),(0,0,1),(0,1,0),7.3,.54)
    if board.family=="tuf":
        for offset in (0,4.5,9.0):
            rail(top(mats["yellow"]),"x",[(h*.17+offset,z-13),(h*.24+offset,z+12)],-24.55,1.35,.12)
    top.finish()

    chipset=Part("southbridge-heatsink-decorative-plate",root)
    center_y=-h*.301 if board.family!="pro" else -h*.308
    center_z=w*.315
    milled_heatsink(chipset,mats,center_y,center_z,h*.192,65.0 if board.family=="mag" else 42.9,12.95)
    label(chipset(mats["silk"]),board.chipset,(-13.2,center_y,center_z-14.0),(0,0,1),(0,1,0),6.2,.36)
    if board.family=="tuf":
        for i in range(5):
            block(chipset(mats["led"]),(-2.7,-h*.473+i*4.5,w*.477),(3.6,2.8,2.21),.32,"x")
    chipset.finish()


def expansion(root,board,mats):
    h,w=board.height,WIDTH
    part=Part("pcie-m2-storage-and-latches",root)
    for index,(look,long) in enumerate(board.pcie):
        y,z=h*look,-w*.11 if long else -w*.31
        length=89.0 if long else 25.0
        material_for_slot=mats["silver"] if index==0 and board.family!="tuf" else mats["body"]
        block(part(material_for_slot),(-4.3,y,z),(7.3,8.3,length),.84,"x")
        block(part(mats["cavity"]),(-8.03,y,z),(.23,3.2,length-4.65),.32,"x")
        for i in range(41 if long else 12):
            n=41 if long else 12
            a=z+(i-(n-1)/2)*(length-8)/n
            if 9.2<a-z<12:
                continue
            for dy in (-1.18,1.18):
                block(part(mats["gold"]),(-8.17,y+dy,a),(.16,.52,.63),0,"x")
        if long:
            block(part(mats["body"]),(-5.2,y,z+length/2+6.0),(7.1,8.6,10.2),.85,"x")
        if index==0:
            empty("mount-pcie-primary",(-8.17,y,z),root)
    for index in range(board.m2):
        y,z = ((-h*.075,-w*.09),(-h*.271,-w*.09),(-h*.458,-w*.089),(-h*.31,w*.22))[index]
        length=114 if board.height>300 else 90
        block(part(mats["body"]),(-3.3,y,z+length/2-12),(5.1,21.6,12.6),.71,"x")
        for i in range(15):
            block(part(mats["gold"]),(-5.92,y+(i-7)*1.16,z+length/2-15.5),(.21,.38,1.87),0,"x")
        # A short rail denotes a removable M.2 shield without hiding the selected drive.
        block(part(mats["guard"]),(-4.8,max(-h/2+3.2,y-14.1),z),(7.7,5.1,length-12.5),.62,"x")
        for gap in (15.0,31.0,48.0):
            disc(part(mats["silver"]),"x",y,z-gap,-1.39,3.0,1.06,16)
        empty(f"mount-m2-{index}",(-6.9,y,z),root)
    part.finish()


def power_headers(root,board,mats):
    h,w=board.height,WIDTH
    part=Part("atx-eps-sata-and-front-panel-headers",root)
    configs=[(h*.13,w*.466,12),(h*.463,-w*.259,4)]
    if board.family=="mag":
        configs.append((h*.463,-w*.126,4))
    for index,(y,z,pins) in enumerate(configs):
        for row in (0,1):
            for pin in range(pins):
                py,pz=(y+(pin-(pins-1)/2)*3.23,z+(row-.5)*3.63) if index==0 else (y+(row-.5)*3.63,z+(pin-(pins-1)/2)*3.23)
                block(part(mats["body"]),(-4.45,py,pz),(7.0,3.45,3.41),.50,"x")
                block(part(mats["cavity"]),(-8.02,py,pz),(.22,1.86,1.82),.25,"x")
                disc(part(mats["gold"]),"x",py,pz,-8.15,.65,.25,8)
        empty("connector-atx-24pin" if index==0 else f"connector-eps-8pin-{index-1}",(-8.2,y,z),root)
    for i in range(board.sata):
        y=-h*.405+(i//2)*16.0
        z=w*.46 - (i%2)*13.5
        block(part(mats["body"]),(-6.7,y,z),(11.4,13.3,12.6),.96,"x")
        block(part(mats["cavity"]),(-8.5,y,z+6.34),(4.5,9.53,.18),.31,"z")
        for j in range(5):
            block(part(mats["gold"]),(-8.93,y+(j-2)*1.26,z+6.46),(1.35,.42,.26),.065,"z")
    for i in range(11):
        y,z=-h*.458,-w*.4+i*w*.074
        block(part(mats["cavity"]),(-3.1,y,z),(4.5,7.5,9.6),.61,"x")
        for col in range(4):
            for row in (-1,1):
                disc(part(mats["gold"]),"x",y+row*1.32,z+(col-1.5)*1.66,-6.07,.78,2.72,7)
    part.finish()


def rear_ports(root,board,mats):
    h,w=board.height,WIDTH
    part=Part("rear-io-with-socket-apertures-and-rf",root)
    face_z=-w/2+.94
    center_y=h*.208
    covered=board.family=="mag"
    if covered:
        block(part(mats["mask"]),(-15.0,center_y,face_z+5.75),(30.4,h*.435,11.35),2.7,"z")
    functions=[("usb",h*.391),("usb",h*.331),("display",h*.270),("net",h*.203),
               ("rf",h*.138),("audio",h*.071),("audio",h*.035)]
    for index,(kind,y) in enumerate(functions):
        if kind in {"usb","display","net"}:
            size=(17.2,15.8) if kind=="net" else (6.3,13.5)
            offsets=(-16.6,) if kind=="net" else (-8.0,-16.6)
            for j,x in enumerate(offsets):
                dx,dy=size
                block(part(mats["silver"]),(x,y,face_z+3.38),(dx+1.45,dy+1.64,7.4),1.06,"z")
                block(part(mats["cavity"]),(x,y,face_z-.36),(dx-1.5,dy-1.6,.31),.60)
                accent=mats["red"] if covered and index==1 else mats["blue"] if kind=="usb" else mats["guard"]
                block(part(accent),(x+.43,y,face_z-.56),(1.6,dy-3.4,.34),.24)
        elif kind=="rf":
            for j in (0,1):
                x=-8.4-j*10.0
                disc(part(mats["gold"]),"z",x,y,face_z+.32,7.7,1.76,19)
                disc(part(mats["cavity"]),"z",x,y,face_z-.58,3.6,.23,16)
                disc(part(mats["gold"]),"z",x,y,face_z-.74,.97,.31,12)
        else:
            for j in (0,1):
                x=-7.65-j*8.0
                disc(part(mats["silver"]),"z",x,y,face_z+.7,8.2,2.51,20)
                disc(part(mats["cavity"]),"z",x,y,face_z-.63,5.87,.23,16)
    part.finish()
    empty("mount-rear-io",(-15,center_y,-w/2),root)


def make_board(board):
    root=empty(board.identifier)
    root["provenance"]="LUMO original approximation using manufacturer layout references and form-factor dimensions"
    root["reference"]=board.source
    root["layer_datum"]=0
    mats=colors(board)
    pcb(root,board,mats)
    thermal_components(root,board,mats)
    cpu_socket(root,board,mats)
    dimm_slots(root,board,mats)
    expansion(root,board,mats)
    power_headers(root,board,mats)
    rear_ports(root,board,mats)
    empty("mount-board-origin",(0,0,0),root)
    return root


if __name__=="__main__":
    requested = set(sys.argv[sys.argv.index("--")+1:]) if "--" in sys.argv else set()
    for board in BOARDS:
        if not requested-{"--render"} or board.identifier in requested:
            save(board.identifier,partial(make_board,board),(-495,290,310),.435)
