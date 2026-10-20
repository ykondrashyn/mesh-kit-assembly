#!/usr/bin/env python3
"""Build five fully native Blender instruction scenes from the Seeed CAD meshes.

Run: blender --background --factory-startup --python scripts/build_blender.py
All page elements are meshes, curves or editable text. No raster image inputs.
"""
from pathlib import Path
import argparse
import gzip
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[1]
W, H = 2000, 1125
OUT = ROOT / 'output'
PAGES = OUT / 'pages'
PAGES.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--preview', action='store_true')
parser.add_argument('--page', type=int)
parser.add_argument('--no-render', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])

bpy.ops.wm.read_factory_settings(use_empty=True)
FONT = bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial.ttf')
BOLD = bpy.data.fonts.load('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
FONT.pack()
BOLD.pack()
MATERIALS = {}
ASSETS = {}
LAYOUT = []
PAGE_TEXTS = {}
VERTEX_CACHE = {}
PLUG_ASSETS = []
# I-PEX MHF I reference: plug and cable relative to its mated PCB plane.
PLUG_SOCKET_TOP = 1.25
PLUG_JOIN = (0,7,1.635-PLUG_SOCKET_TOP)


def emission(name, rgb):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    n = m.node_tree.nodes
    n.clear()
    out = n.new('ShaderNodeOutputMaterial')
    shader = n.new('ShaderNodeEmission')
    shader.inputs['Color'].default_value = (*rgb, 1)
    m.node_tree.links.new(shader.outputs[0], out.inputs['Surface'])
    return m


def shaded(name, light, dark):
    """Soft technical shading with a controlled neutral palette."""
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*light, 1)
    m.use_nodes = True
    n = m.node_tree.nodes
    n.clear()
    out = n.new('ShaderNodeOutputMaterial')
    diffuse = n.new('ShaderNodeBsdfDiffuse')
    diffuse.inputs['Color'].default_value = (0.8, 0.8, 0.8, 1)
    diffuse.inputs['Roughness'].default_value = 0.65
    shader_rgb = n.new('ShaderNodeShaderToRGB')
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'EASE'
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = (*dark, 1)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (*light, 1)
    final = n.new('ShaderNodeEmission')
    m.node_tree.links.new(diffuse.outputs[0], shader_rgb.inputs[0])
    m.node_tree.links.new(shader_rgb.outputs[0], ramp.inputs[0])
    m.node_tree.links.new(ramp.outputs[0], final.inputs['Color'])
    m.node_tree.links.new(final.outputs[0], out.inputs['Surface'])
    return m


MATERIALS['ink'] = emission('Ink / instructions', (0.014, 0.019, 0.022))
MATERIALS['muted'] = emission('Secondary text', (0.10, 0.13, 0.15))
MATERIALS['line'] = emission('Original CAD outlines', (0.065, 0.080, 0.090))
MATERIALS['rule'] = emission('Page rules', (0.72, 0.75, 0.76))
MATERIALS['pcb'] = shaded('PCB / light neutral', (.83,.86,.85), (.42,.48,.47))
MATERIALS['metal'] = shaded('Shield and connector metal', (.93,.94,.95), (.46,.51,.55))
MATERIALS['gold'] = shaded('Contacts / warm neutral', (.67,.62,.44), (.29,.26,.17))
MATERIALS['dark'] = shaded('Dark components', (.10,.13,.14), (.018,.026,.030))
MATERIALS['ceramic'] = shaded('Small components', (.69,.67,.62), (.33,.31,.28))
MATERIALS['antenna'] = shaded('Antenna film', (.94,.95,.95), (.62,.66,.67))
MATERIALS['cable'] = shaded('Coax jacket', (.07,.09,.10), (.012,.019,.023))
MATERIALS['arrow'] = emission('Press direction', (.028,.050,.065))


def object_from_mesh(name, verts, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(MATERIALS[mat])
    mesh.update()
    ob = bpy.data.objects.new(name, mesh)
    return ob


def edges_object(name, segments, radius=.013):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 0
    curve.resolution_u = 1
    for a, b in segments:
        sp = curve.splines.new('POLY')
        sp.points.add(1)
        sp.points[0].co = (*a, 1)
        sp.points[1].co = (*b, 1)
    curve.materials.append(MATERIALS['line'])
    return bpy.data.objects.new(name, curve)


def load_cad():
    path = ROOT / 'meshes/official-meshes.json.gz'
    data = json.loads(gzip.decompress(path.read_bytes()))
    for record in data['objects']:
        name = record['name']
        mat = record.get('material', 'metal')
        if mat not in MATERIALS:
            mat = 'metal'
        ob = object_from_mesh(name, record['vertices'], record['faces'], mat)
        ob['provenance'] = record.get('source', record.get('category', 'Manufacturer STEP'))
        ob['category'] = record.get('category', '')
        ob['board'] = record.get('board', '')
        obs = [ob]
        if record.get('edges'):
            edge = edges_object(name + ' / CAD edges', record['edges'],
                                .013 if record.get('category') == 'connector_detail' else .030)
            edge['provenance'] = 'Original BRep feature edges, no tessellation seams'
            obs.append(edge)
        ASSETS[name] = dict(record=record, objects=obs)
    return data


def load_plug():
    """Use the same complete manufacturer plug mesh on both antennas."""
    data = json.loads(gzip.decompress((ROOT/'meshes/rf-plug.json.gz').read_bytes()))
    for record in data['objects']:
        ob = object_from_mesh('RF plug / '+record['name'],record['vertices'],record['faces'],'gold')
        names = record.get('material_names', ['gold'])
        if record.get('face_materials'):
            ob.data.materials.clear()
            for name in names:
                ob.data.materials.append(MATERIALS[name if name in MATERIALS else 'gold'])
            for poly,index in zip(ob.data.polygons,record['face_materials']):
                poly.material_index = index
        ob['provenance'] = 'I-PEX MHF I 20278-1xxR-13 manufacturer STEP, representative of kit connector style'
        ob['category'] = 'manufacturer_rf_plug'
        objects = [ob]
        if record.get('edges'):
            # The source's straight stub ends at Y=7. Hide its artificial
            # terminal outline where the continuous native cable begins.
            edges = [edge for edge in record['edges']
                     if not all(abs(p[1]-7)<1e-5 for p in edge)]
            objects.append(edges_object('RF plug / original CAD edges',edges,.012))
        PLUG_ASSETS.append(dict(record=record,objects=objects))


def clone_asset(asset, delta=(0,0,0)):
    result = []
    for base in asset['objects']:
        ob = base.copy()
        ob.data = base.data
        ob.location = delta
        result.append(ob)
    return result


def local_text(label, center, height, mat='ink', bold=False):
    data = bpy.data.curves.new(label, 'FONT')
    data.body = label
    data.font = BOLD if bold else FONT
    data.size = height
    data.align_x = 'CENTER'
    data.align_y = 'CENTER'
    data.resolution_u = 8
    data.materials.append(MATERIALS[mat])
    ob = bpy.data.objects.new('Printed label / ' + label, data)
    ob.location = center
    ob['provenance'] = 'Simplified device identifier, not exact factory artwork'
    return ob


def addv(a, b):
    return tuple(x+y for x,y in zip(a,b))


def board(name, delta=(0,0,0)):
    obs = []
    for asset in ASSETS.values():
        r = asset['record']
        if r.get('board') == name and r.get('category') in ('official_board', 'supplemental_board'):
            obs.extend(clone_asset(asset, delta))
    if name == 'xiao':
        label, pos, size = 'ESP32-S3', (8.89,12.01,3.28), 2.50
    else:
        label, pos, size = 'SX1262', (8.89,15.40,3.83), 2.60
    obs.append(local_text(label, addv(pos,delta), size))
    return obs


def detail(key, delta=(0,0,0)):
    obs = []
    for asset in ASSETS.values():
        r = asset['record']
        if r.get('category') == 'connector_detail' and r.get('detail_key') == key:
            obs.extend(clone_asset(asset, delta))
    if not obs:
        raise RuntimeError('Missing connector detail ' + key)
    return obs


def box(name, origin, dimensions, mat='metal', outlined=True):
    x,y,z = origin
    w,l,h = dimensions
    v = [(x,y,z),(x+w,y,z),(x+w,y+l,z),(x,y+l,z),
         (x,y,z+h),(x+w,y,z+h),(x+w,y+l,z+h),(x,y+l,z+h)]
    f = [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    obs = [object_from_mesh(name, v, f, mat)]
    if outlined:
        pairs = [(0,1),(1,2),(2,3),(3,0),(4,5),(5,6),(6,7),(7,4),(0,4),(1,5),(2,6),(3,7)]
        obs.append(edges_object(name+' / outline',[(v[a],v[b]) for a,b in pairs], .018))
    return obs


def prism(name, outline, z, h, mat='metal'):
    n = len(outline)
    v = [(x,y,z) for x,y in outline]+[(x,y,z+h) for x,y in outline]
    f = [tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    f += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    edge = [(v[i],v[(i+1)%n]) for i in range(n)]
    edge += [(v[i+n],v[(i+1)%n+n]) for i in range(n)]
    edge += [(v[i],v[i+n]) for i in range(n)]
    return [object_from_mesh(name,v,f,mat),edges_object(name+' / outline',edge,.017)]


def plug(pos):
    obs = []
    delta = addv(pos,(0,0,-PLUG_SOCKET_TOP))
    for asset in PLUG_ASSETS:
        obs.extend(clone_asset(asset,delta))
    return obs


def cable(name, points, radius=.56501):
    curve = bpy.data.curves.new(name,'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 48
    curve.bevel_resolution = 3
    curve.bevel_depth = radius
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(1)
    a,b,c,d = [Vector(p) for p in points]
    p,q = spline.bezier_points
    p.co, q.co = a,d
    p.handle_left_type = p.handle_right_type = 'FREE'
    q.handle_left_type = q.handle_right_type = 'FREE'
    p.handle_right, p.handle_left = b, 2*a-b
    q.handle_left, q.handle_right = c, 2*d-c
    curve.materials.append(MATERIALS['cable'])
    ob = bpy.data.objects.new(name,curve)
    ob['provenance'] = 'Illustrative bend, native editable Bezier curve'
    return ob


def press_arrow(pos, scale=1):
    # Vertical plate, exactly parallel to the connector insertion direction.
    xy = [(-.48,8),(.48,8),(.48,2.6),(1.65,2.6),(0,0),(-1.65,2.6),(-.48,2.6)]
    v = [addv(pos,(x*scale,0,z*scale)) for x,z in xy]
    return object_from_mesh('Press straight down / arrow',v,[(0,1,2,6),(6,2,3,4,5)],'arrow')


def antenna_body(kind, base):
    w,l = (17.5,37.4) if kind == 'wifi' else (7,40)
    fy = 18.7 if kind == 'wifi' else 3
    obs = box(kind+' antenna / FPC film',base,(w,l,.18),'antenna')
    obs += box(kind+' antenna / solder tab',addv(base,(w/2-1.1,fy-.85,.18)),(2.2,1.7,.45),'dark')
    return obs


def antenna(kind, base, rf, lift=0):
    w,fy,side = (17.5,18.7,1) if kind == 'wifi' else (7,3,-1)
    feed = addv(base,(w/2,fy,.5))
    cap = addv(rf,(0,0,lift))
    tail = addv(cap,PLUG_JOIN)
    obs = antenna_body(kind,base) + plug(cap)
    obs.append(cable(kind+' / coax', [tail,addv(tail,(0,13,0)),addv(feed,(-12*side,9,2)),feed]))
    return obs


def inventory_antenna(kind):
    w,fy = (17.5,18.7) if kind == 'wifi' else (7,3)
    feed = (w/2,fy,.5)
    cap = (w/2-4,-13,0)
    obs = antenna_body(kind,(0,0,0)) + plug(cap)
    join = addv(cap,PLUG_JOIN)
    obs.append(cable(kind+' / inventory lead',[feed,addv(feed,(5,-9,.5)),addv(join,(0,6,0)),join]))
    return obs


XRF, WRF = (13.6167,19.2334,2.5), (5.3984,19.4793,2.9)


def assembly(name):
    if name in ('part-xiao','part-wio'):
        return board(name[5:])
    if name in ('part-wifi','part-lora'):
        return inventory_antenna(name[5:])
    if name == 'main-wifi':
        return board('xiao') + antenna('wifi',(25,0,0),XRF,7) + [press_arrow(addv(XRF,(0,0,.5)),.68)]
    if name == 'main-lora':
        return board('wio') + antenna('lora',(-20,0,0),WRF,7) + [press_arrow(addv(WRF,(0,0,.5)),.68)]
    if name in ('main-exploded','main-assembled'):
        gap = 30 if name.endswith('exploded') else 5
        obs = board('xiao') + board('wio',(0,0,gap))
        obs += antenna('wifi',(34,-5,0),XRF)
        # Keep the LoRa sheet and cable outside both PCB silhouettes. These
        # positions are shared by the dedicated and combined step 04 views.
        obs += antenna('lora',(-32,-5,gap-6 if gap>5 else 5),addv(WRF,(0,0,gap)))
        if gap>5:
            obs.append(press_arrow((6.7307,19.4056,3),1.4))
        return obs
    if name.startswith('close-') and name != 'close-b2b':
        _,key,state = name.split('-')
        plane = 1.25 if key == 'xiao' else 1.30
        base = plane+3.8 if state == 'align' else plane
        obs = box('PCB context / illustrative',(-3.8,-2.7,-.55),(7.6,5.4,.55),'pcb')
        obs += detail(key+'-rf') + plug((0,0,base))
        join = addv((0,0,base),PLUG_JOIN)
        obs.append(cable('RF close-up / coax',[join,addv(join,(0,1.5,0)),addv(join,(2.2,3,0)),addv(join,(4.8,3,0))]))
        if state == 'align':
            obs.append(press_arrow((0,0,plane+.25),.30))
        return obs
    if name == 'close-b2b':
        obs = box('XIAO PCB context',(-5.5,-2.6,-.55),(11,5.2,.55),'pcb')
        obs += detail('xiao-b2b')
        obs += box('Wio PCB context',(-5.5,-2.6,9),(11,5.2,.55),'pcb')
        obs += detail('wio-b2b',(0,0,9))
        obs.append(press_arrow((0,0,1.05),.48))
        return obs
    raise ValueError(name)


def new_page(number, title):
    scene = bpy.data.scenes.new(f'{number:02d} / {title}')
    bpy.context.window.scene = scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 3200
    scene.render.resolution_y = 1800
    scene.render.resolution_percentage = 50 if args.preview else 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.color_depth = '8'
    scene.render.film_transparent = False
    scene.render.image_settings.compression = 30
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    if hasattr(scene.eevee, 'taa_render_samples'):
        scene.eevee.taa_render_samples = 64 if args.preview else 128
    world = bpy.data.worlds.new(scene.name+' / paper')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (1,1,1,1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
    scene.world = world
    camera_data = bpy.data.cameras.new('Page camera / orthographic')
    camera = bpy.data.objects.new('Page camera / orthographic',camera_data)
    camera.location = (W/2,H/2,5000)
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = W
    camera_data.clip_end = 10000
    scene.collection.objects.link(camera)
    scene.camera = camera
    for name,rotation,energy in [('Key',(.25,-.35,-.25),2.5),('Fill',(-.6,.8,1),.7)]:
        data = bpy.data.lights.new(name,'SUN')
        data.energy = energy
        data.angle = .20
        ob = bpy.data.objects.new(name,data)
        ob.rotation_euler = rotation
        scene.collection.objects.link(ob)
    scene['page_number'] = number
    scene['authoring'] = 'All geometry, arrows, type and page layout authored in Blender'
    scene['image_inputs'] = 0
    PAGE_TEXTS[number] = []
    return scene


def text(scene, label, x, y, size=32, bold=False, muted=False):
    # Top-origin page coordinates. Native text remains editable in the blend.
    ob = local_text(label,(x,H-y,1200),size/.72,'muted' if muted else 'ink',bold)
    ob.name = 'Page text / '+label
    ob.data.align_x = 'LEFT'
    ob.data.align_y = 'TOP_BASELINE'
    # Blender font size is an em height. Align visible capital tops to y.
    ob.location.y -= size
    scene.collection.objects.link(ob)
    PAGE_TEXTS[scene['page_number']].append(label)
    return ob


def rule(scene, x1,y1,x2,y2):
    ob = edges_object('Page divider',[((x1,H-y1,1100),(x2,H-y2,1100))],.55)
    ob.data.materials.clear()
    ob.data.materials.append(MATERIALS['rule'])
    scene.collection.objects.link(ob)


def header(scene, title, sub):
    text(scene,title,60,30,52,True)
    text(scene,sub,65,105,29,muted=True)


def panel(scene, name, x,y,w,h, elevation=None, azimuth=-30):
    group = bpy.data.collections.new(name+' / view')
    scene.collection.children.link(group)
    objects = assembly(name)
    for ob in objects:
        group.objects.link(ob)
    bpy.context.view_layer.update()
    elevation = elevation if elevation is not None else (28 if name=='close-b2b' else 32 if name=='main-exploded' else 38 if name.startswith('close-') else 45)
    az,el = math.radians(azimuth),math.radians(elevation)
    c,s,ce,se = math.cos(az),math.sin(az),math.cos(el),math.sin(el)
    rot = Matrix(((c,-s,0),(s*se,c*se,ce),(-s*ce,-c*ce,se)))
    # Fit the actual projected surfaces, not the much larger rotated 3D
    # bounding boxes of curved cables. This keeps the boards large on page.
    lo,hi = Vector((1e10,1e10,1e10)),Vector((-1e10,-1e10,-1e10))
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for ob in objects:
        key = ob.data.as_pointer()
        if key not in VERTEX_CACHE:
            if ob.type == 'MESH':
                VERTEX_CACHE[key] = [v.co.copy() for v in ob.data.vertices]
            else:
                evaluated = ob.evaluated_get(depsgraph)
                mesh = evaluated.to_mesh()
                VERTEX_CACHE[key] = [v.co.copy() for v in mesh.vertices]
                evaluated.to_mesh_clear()
        transform = rot.to_4x4() @ ob.matrix_world
        for point in VERTEX_CACHE[key]:
            point = transform @ point
            for i in range(3):
                lo[i] = min(lo[i],point[i])
                hi[i] = max(hi[i],point[i])
    factor = min(w/(hi.x-lo.x),h/(hi.y-lo.y))*.97
    center = (lo+hi)/2
    origin = Vector((x+w/2,H-y-h/2,0)) - center*factor
    root = bpy.data.objects.new(name+' / move or scale this view',None)
    group.objects.link(root)
    root.matrix_world = Matrix.Translation(origin) @ rot.to_4x4() @ Matrix.Scale(factor,4)
    for ob in objects:
        ob.parent = root
    root['diagram'] = name
    root['model_units'] = 'mm before page layout scale'
    root['elevation_degrees'] = elevation
    root['azimuth_degrees'] = azimuth
    LAYOUT.append(dict(page=scene['page_number'],diagram=name,x=x,y=y,w=w,h=h,
                       scale=factor,objects=len(objects),bounds_mm=[list(lo),list(hi)]))
    return root


def build_pages():
    scene = new_page(1,'Check the parts')
    header(scene,'01  CHECK THE PARTS','Two boards and two antennas. Leave USB power disconnected.')
    panel(scene,'part-xiao',40,175,590,400)
    panel(scene,'part-wio',1040,175,560,400)
    panel(scene,'part-wifi',40,650,590,375)
    panel(scene,'part-lora',1040,650,560,375)
    for x,y,letter,name,note in [(655,270,'A   1x','XIAO ESP32S3','Main board'),(1620,270,'B   1x','Wio-SX1262','LoRa board'),(655,755,'C   1x','Wi-Fi antenna','Broad, 2.4 GHz'),(1620,755,'D   1x','LoRa antenna','Long and narrow')]:
        text(scene,letter,x,y,40,True)
        text(scene,name,x,y+65,31)
        text(scene,note,x,y+113,25,muted=True)
    for num,kind,key in [(2,'wifi','xiao'),(3,'lora','wio')]:
        scene = new_page(num,'Connect '+kind)
        header(scene,'02  CONNECT WI-FI' if num==2 else '03  CONNECT LORA',
               'Broad antenna C + board A' if num==2 else 'Narrow antenna D + board B')
        panel(scene,'main-'+kind,35,195,1180,790)
        text(scene,'PLUG CLOSE-UP',1310,173,34,True)
        panel(scene,'close-'+key+'-align',1290,242,655,338)
        text(scene,'Center it over the socket.',1310,606,28)
        panel(scene,'close-'+key+'-seated',1300,660,640,280)
        text(scene,'Press straight down until seated.',1310,975,28)
        text(scene,'Keep the plug level. Press the metal cap, not the cable.',65,1062,31)
    scene = new_page(4,'Join the boards')
    header(scene,'04  JOIN THE BOARDS','Wio above XIAO. Keep both antennas connected and both shields facing up.')
    text(scene,'ALIGN THE BOARDS',65,180,34,True)
    text(scene,'REAR CONNECTOR CLOSE-UP',840,180,32,True)
    text(scene,'JOINED',1510,180,34,True)
    panel(scene,'main-exploded',20,250,790,690)
    panel(scene,'close-b2b',840,290,560,565)
    panel(scene,'main-assembled',1435,280,515,630)
    text(scene,'Wio underside',855,241,27)
    text(scene,'XIAO top',855,900,27)
    text(scene,'Align the small connector,',65,985,30)
    text(scene,'then press straight down.',65,1030,30)
    text(scene,'XIAO socket shown simplified.',840,1007,25,muted=True)
    text(scene,'Side header pins point down.',1450,1007,27)
    scene = new_page(5,'All steps 01-04')
    header(scene,'MESH KIT  /  STEPS 01-04','XIAO ESP32S3 + Wio-SX1262')
    text(scene,'01  CHECK THE PARTS',65,177,36,True)
    for name,x in [('part-xiao',45),('part-wio',285),('part-wifi',525),('part-lora',765)]:
        panel(scene,name,x,242,220,270)
    for label,x in [('A  XIAO',65),('B  Wio',315),('C  Wi-Fi',550),('D  LoRa',790)]:
        text(scene,label,x,533,28)
    text(scene,'02  CONNECT WI-FI',1055,177,36,True)
    panel(scene,'main-wifi',1025,242,560,315)
    text(scene,'PLUG CLOSE-UP',1630,228,24,True)
    panel(scene,'close-xiao-align',1605,280,350,266)
    text(scene,'Broad antenna to XIAO. Press straight down.',1055,572,28)
    text(scene,'03  CONNECT LORA',65,641,36,True)
    panel(scene,'main-lora',35,700,550,322)
    text(scene,'PLUG CLOSE-UP',635,707,24,True)
    panel(scene,'close-wio-align',610,756,350,266)
    text(scene,'Narrow antenna to Wio. Press straight down.',65,1048,28)
    text(scene,'04  JOIN THE BOARDS',1055,641,36,True)
    panel(scene,'main-exploded',1020,713,540,310)
    text(scene,'REAR CONNECTOR',1605,707,24,True)
    panel(scene,'close-b2b',1580,754,375,268)
    text(scene,'Wio above XIAO. Press straight down.',1055,1048,28)
    text(scene,'XIAO socket simplified.',1610,1090,20,muted=True)
    return scene


data = load_cad()
load_plug()
overview = build_pages()
for scene in list(bpy.data.scenes):
    if 'page_number' not in scene:
        bpy.data.scenes.remove(scene)
bpy.context.window.scene = overview
# Open the deliverable looking through the overview camera, with neutral material preview.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
            area.spaces.active.shading.type = 'MATERIAL'
            area.spaces.active.shading.use_scene_lights = True
            area.spaces.active.shading.use_scene_world = True
            area.spaces.active.overlay.show_overlays = False
            area.spaces.active.region_3d.view_camera_zoom = 0

readme = bpy.data.texts.new('START HERE / Mesh Kit guide')
readme.write('MESH KIT / BLENDER EDITION\n\nFive editable page scenes, choose them in the scene menu.\n'
             'Use Numpad 0 for the page camera and F12 to render.\n'
             'Each view has a move/scale empty. Meshes, Bezier cables, arrows and text are native Blender objects.\n'
             'Both official STEP boards are complete. The RF plugs use I-PEX MHF I manufacturer CAD, matched to the connector style in Seeed photos.\n'
             'The XIAO B2B socket, headers, button and antennas are illustrative additions.\n'
             'ESP32-S3 and SX1262 are simplified labels, not factory artwork.\n'
             'No raster image inputs, LDraw, LPub3D or AI image generation are used by this Blender project.\n'
             'See README.txt and source-models/ for provenance and rebuild commands.\n')

for scene in bpy.data.scenes:
    number = scene['page_number']
    scene.render.filepath = '//output/pages/' + f'{number:02d}-{["parts","wifi","lora","boards","all-steps"][number-1]}.png'
    scene['text_content'] = json.dumps(PAGE_TEXTS[number])
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'mesh-kit.blend'), compress=True)
(ROOT/'research/layout.json').write_text(json.dumps(LAYOUT,indent=2)+'\n')
(ROOT/'research/scene-manifest.json').write_text(json.dumps({
    'blender_version':bpy.app.version_string,'renderer':'EEVEE','projection':'orthographic',
    'scenes':[{ 'name':s.name,'page':s['page_number'],'objects':len(s.objects),'camera':s.camera.name,
                'texts':PAGE_TEXTS[s['page_number']]} for s in bpy.data.scenes],
    'native_objects':{'meshes':len(bpy.data.meshes),'curves':len(bpy.data.curves),'fonts':len(bpy.data.fonts)},
    'external_image_inputs':0,'ai_image_generation':False,'layout_rendered_in':'Blender',
},indent=2)+'\n')
if not args.no_render:
    for scene in sorted(bpy.data.scenes,key=lambda s:s['page_number']):
        if args.page and scene['page_number'] != args.page:
            continue
        bpy.context.window.scene = scene
        print('RENDER PAGE',scene['page_number'],scene.name,flush=True)
        bpy.ops.render.render(write_still=True,scene=scene.name)
    if not args.preview and not args.page:
        sys.path.insert(0,str(ROOT/'scripts'))
        from export_outputs import export_outputs
        export_outputs(ROOT)
print('Blender guide complete',ROOT/'mesh-kit.blend',flush=True)
