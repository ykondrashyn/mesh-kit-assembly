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
import random
import sys

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent / 'geometry-data'
W, H = 2000, 1125
OUT = ROOT / 'output'
PAGES = OUT / 'pages'

args = argparse.Namespace(preview=False)

bpy.ops.wm.read_factory_settings(use_empty=True)
FONT = bpy.data.fonts.load(str(ROOT/'fonts/Arial.ttf'))
BOLD = bpy.data.fonts.load(str(ROOT/'fonts/Arial Bold.ttf'))
FONT.pack()
BOLD.pack()
MATERIALS = {}
ASSETS = {}
LAYOUT = []
PAGE_TEXTS = {}
VERTEX_CACHE = {}
PLUG_ASSETS = {}
PLUG_SPECS = {}
CALLOUTS = []
# I-PEX MHF I reference: plug and cable relative to its mated PCB plane.
PLUG_SOCKET_TOP = 1.25


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


MATERIALS['ink'] = emission('Ink / instructions', (.006,.006,.006))
MATERIALS['paper'] = emission('Callout paper halo', (1,1,1))
MATERIALS['muted'] = emission('Secondary text', (.10,.10,.10))
MATERIALS['line'] = emission('Original CAD outlines', (.022,.022,.022))
MATERIALS['rule'] = emission('Page rules', (0.72, 0.75, 0.76))
MATERIALS['pcb'] = shaded('PCB / light neutral', (.88,.88,.88), (.58,.58,.58))
MATERIALS['metal'] = shaded('Shield and connector metal', (.96,.96,.96), (.60,.60,.60))
MATERIALS['gold'] = shaded('Contacts / monochrome', (.84,.84,.84), (.42,.42,.42))
MATERIALS['dark'] = shaded('Dark components', (.07,.07,.07), (.012,.012,.012))
MATERIALS['ceramic'] = shaded('Small components', (.73,.73,.73), (.35,.35,.35))
MATERIALS['antenna'] = shaded('Antenna film', (.97,.97,.97), (.72,.72,.72))
MATERIALS['cable'] = shaded('Coax jacket', (.035,.035,.035), (.006,.006,.006))
MATERIALS['arrow'] = emission('Press direction', (.008,.008,.008))


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
                                .022 if record.get('category') == 'connector_detail' else .045)
            edge['provenance'] = 'Original BRep feature edges, no tessellation seams'
            obs.append(edge)
        ASSETS[name] = dict(record=record, objects=obs)
    return data


def load_plug():
    """Keep distinct complete 1.13 mm and 1.37 mm manufacturer plug meshes."""
    for kind,filename in [('wifi','rf-plug.json.gz'),('lora','rf-plug-137.json.gz')]:
        data = json.loads(gzip.decompress((ROOT/'meshes'/filename).read_bytes()))
        meta=data['metadata']
        join=meta['cable_join']
        PLUG_SPECS[kind]={'join':addv(join['native_curve_start_mm'],(0,0,-PLUG_SOCKET_TOP)),
                          'radius':join['radius_mm']}
        PLUG_ASSETS[kind]=[]
        for record in data['objects']:
            ob = object_from_mesh('RF plug / '+record['name'],record['vertices'],record['faces'],'gold')
            names = record.get('material_names', ['gold'])
            if record.get('face_materials'):
                ob.data.materials.clear()
                for name in names:
                    ob.data.materials.append(MATERIALS[name if name in MATERIALS else 'gold'])
                for poly,index in zip(ob.data.polygons,record['face_materials']):
                    poly.material_index = index
            ob['provenance'] = 'I-PEX MHF I '+meta['model']+', representative of kit connector style'
            ob['category'] = 'manufacturer_rf_plug'
            ob['antenna_kind'] = kind
            ob['nominal_cable_diameter_mm'] = 1.13 if kind=='wifi' else 1.37
            objects = [ob]
            if record.get('edges'):
                # Hide the artificial stub-end outline at the native cable join.
                end=join['native_curve_start_mm'][1]
                edges = [edge for edge in record['edges']
                         if not all(abs(p[1]-end)<1e-5 for p in edge)]
                objects.append(edges_object('RF plug / original CAD edges',edges,.018))
            PLUG_ASSETS[kind].append(dict(record=record,objects=objects))


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


def plug(kind,pos):
    obs = []
    delta = addv(pos,(0,0,-PLUG_SOCKET_TOP))
    for asset in PLUG_ASSETS[kind]:
        obs.extend(clone_asset(asset,delta))
    if kind=='lora':
        # The source contains the engraved 37. Add the separately observed
        # second line without changing any original CAD surface.
        stamp=local_text('C M',addv(delta,(0,1.02,2.425)),.62,mat='line')
        stamp.rotation_euler.z=math.pi
        stamp['category']='observed_connector_marking'
        stamp['antenna_kind']='lora'
        stamp['provenance']='C M marking reported by the user on the LoRa plug. Meaning and supplier unverified. Simplified native text.'
        obs.append(stamp)
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
    label = local_text('Wi-Fi\n2.4 GHz' if kind=='wifi' else 'LoRa\n868 MHz',
                       addv(base,(w/2,l*(.72 if kind=='wifi' else .57),.22)),
                       2.8 if kind=='wifi' else 2.6)
    label.rotation_euler.z = math.pi/2
    label.data.space_line = .9
    label['antenna_kind'] = kind
    label['frequency_label'] = '2.4 GHz' if kind=='wifi' else '868 MHz'
    label['provenance'] = 'User-requested instructional antenna label'
    obs.append(label)
    return obs


def antenna(kind, base, rf, lift=0, relaxed=False):
    w,fy,side = (17.5,18.7,1) if kind == 'wifi' else (7,3,-1)
    feed = addv(base,(w/2,fy,.5))
    cap = addv(rf,(0,0,lift))
    tail = addv(cap,PLUG_SPECS[kind]['join'])
    obs = antenna_body(kind,base) + plug(kind,cap)
    # Preserve the plug's exit tangent, then add visible slack near the film
    # in the exploded view so the lead reads as a flexible cable.
    feed_handle=(-8,22,3) if relaxed else (-12*side,9,2)
    obs.append(cable(kind+' / coax', [tail,addv(tail,(0,13,0)),addv(feed,feed_handle),feed],PLUG_SPECS[kind]['radius']))
    return obs


def inventory_antenna(kind):
    w,fy = (17.5,18.7) if kind == 'wifi' else (7,3)
    feed = (w/2,fy,.5)
    cap = (w/2-4,-13,0)
    obs = antenna_body(kind,(0,0,0)) + plug(kind,cap)
    join = addv(cap,PLUG_SPECS[kind]['join'])
    obs.append(cable(kind+' / inventory lead',[feed,addv(feed,(5,-9,.5)),addv(join,(0,6,0)),join],PLUG_SPECS[kind]['radius']))
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
        obs += antenna('lora',(-32,-5,gap-6 if gap>5 else 5),addv(WRF,(0,0,gap)),relaxed=gap>5)
        if gap>5:
            obs.append(press_arrow((6.7307,19.4056,3),1.4))
        return obs
    if name.startswith('close-') and name != 'close-b2b':
        _,key,state = name.split('-')
        kind='wifi' if key=='xiao' else 'lora'
        plane = 1.25 if key == 'xiao' else 1.30
        base = plane+3.8 if state == 'align' else plane
        obs = box('PCB context / illustrative',(-3.8,-2.7,-.55),(7.6,5.4,.55),'pcb')
        obs += detail(key+'-rf') + plug(kind,(0,0,base))
        join = addv((0,0,base),PLUG_SPECS[kind]['join'])
        # Keep the full manufacturer stub. A short illustrative continuation
        # lets the actual connector, rather than spare cable, fill the inset.
        obs.append(cable('RF close-up / coax',[join,addv(join,(0,.9,0)),addv(join,(.8,1.5,0)),addv(join,(2,1.5,0))],PLUG_SPECS[kind]['radius']))
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


def page_path(scene, name, points, width=2.0, closed=False, halo=False):
    """Editable page-space ink, separate from 3D insertion arrows."""
    def stroke(suffix, thickness, mat, z):
        curve = bpy.data.curves.new(name+suffix, 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = thickness/2
        curve.bevel_resolution = 2
        sp = curve.splines.new('POLY')
        sp.points.add(len(points)-1)
        for p,(x,y) in zip(sp.points,points):
            p.co = (x,H-y,z,1)
        sp.use_cyclic_u = closed
        curve.materials.append(MATERIALS[mat])
        ob = bpy.data.objects.new(name+suffix,curve)
        ob['annotation'] = 'magnified_detail'
        scene.collection.objects.link(ob)
        return ob
    if halo:
        stroke(' / paper clearance',width+4,'paper',1090)
    return stroke('',width,'ink',1100)


def ellipse_points(cx,cy,rx,ry):
    return [(cx+rx*math.cos(i*math.tau/128),cy+ry*math.sin(i*math.tau/128)) for i in range(128)]


def magnifier(scene,x,y,size=27):
    r=size*.30
    page_path(scene,'Detail / magnifier lens',ellipse_points(x+r,y+r,r,r),2.1,True)
    page_path(scene,'Detail / magnifier handle',[(x+r*1.7,y+r*1.7),(x+size,y+size)],3.7)


def detail_callout(scene, identifier, source, landmarks, circles, views,
                   via=None, target_y=None,
                   source_angle=-60, padding=12, ring_scale=.72):
    """Link a native enlargement to the same physical area in its full view.

    The unarrowed leader signifies magnification. Only the heavier filled
    arrows within the actual geometry signify motion or insertion.
    """
    projected=[]
    for point in landmarks:
        p=source.matrix_world @ Vector(point)
        projected.append((p.x,H-p.y))
    cx=(min(p[0] for p in projected)+max(p[0] for p in projected))/2
    cy=(min(p[1] for p in projected)+max(p[1] for p in projected))/2
    rx=max(22,(max(p[0] for p in projected)-min(p[0] for p in projected))*ring_scale+padding)
    ry=max(22,(max(p[1] for p in projected)-min(p[1] for p in projected))*ring_scale+padding)
    if max(rx,ry)/min(rx,ry)<1.6:
        rx=ry=max(rx,ry)
    ring=page_path(scene,identifier+' / source ring',ellipse_points(cx,cy,rx,ry),1.8,True,True)
    ring['source_view']=source.name
    ring['callout_role']='source_ring'
    assert len(circles)==len(views)
    borders=[]
    for circle,view in zip(circles,views):
        x,y,r=circle
        border=page_path(scene,identifier+' / circular inset',ellipse_points(x,y,r,r),2.2,True)
        border['detail_views']=json.dumps([view.name])
        border['page_circle']=json.dumps(list(circle))
        border['callout_role']='frame'
        borders.append(border)
    x,y,r=circles[0]
    angle=math.radians(source_angle)
    start=(cx+rx*math.cos(angle),cy+ry*math.sin(angle))
    target_y=y if target_y is None else target_y
    target=(x-math.sqrt(r*r-(target_y-y)**2),target_y)
    route=[start]+(via(cx,cy,rx,ry) if via else [])+[target]
    leader=page_path(scene,identifier+' / magnification leader',route,1.65,halo=True)
    leader['source_view']=source.name
    leader['arrowhead']=False
    leader['callout_role']='leader'
    leaders=[leader]
    for x,y,r in circles[1:]:
        junction=route[-2]
        branch=page_path(scene,identifier+' / magnification branch',
                         [junction,(junction[0],y),(x-r,y)],1.65,halo=True)
        branch['source_view']=source.name
        branch['arrowhead']=False
        branch['callout_role']='leader'
        leaders.append(branch)
    for ob in [ring]+borders+leaders:
        ob['callout_identifier']=identifier
    for view in views:
        view['magnification_callout']=identifier
    CALLOUTS.append(dict(page=scene['page_number'],identifier=identifier,
                         source=source['diagram'],details=[v['diagram'] for v in views],
                         source_ellipse=[cx,cy,rx,ry],circles=[list(c) for c in circles],leader=route))


def rf_landmarks(rf):
    return [addv(rf,(-2,-2,0)),addv(rf,(2,2,0)),
            addv(rf,(-2,-1,9)),addv(rf,(2,4,9))]


B2B_LANDMARKS=[(2.7,19.4,2.2),(10.7,19.4,2.2),
               (2.7,19.4,26.5),(10.7,19.4,26.5)]


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


def enclosing_circle(points):
    """Minimum enclosing circle of the projected convex hull."""
    def cross(a,b,c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    ordered=sorted(set(points))
    lower,upper=[],[]
    for sequence,hull in ((ordered,lower),(reversed(ordered),upper)):
        for p in sequence:
            while len(hull)>1 and cross(hull[-2],hull[-1],p)<=0:
                hull.pop()
            hull.append(p)
    points=lower[:-1]+upper[:-1]
    random.Random(42).shuffle(points)
    def outside(p,c):
        return c is None or math.hypot(p[0]-c[0],p[1]-c[1])>c[2]+1e-7
    def diameter(p,q):
        return ((p[0]+q[0])/2,(p[1]+q[1])/2,math.dist(p,q)/2)
    def circumcircle(a,b,c):
        bx,by=b[0]-a[0],b[1]-a[1]
        cx,cy=c[0]-a[0],c[1]-a[1]
        d=2*(bx*cy-by*cx)
        if abs(d)<1e-10:
            return max((diameter(a,b),diameter(a,c),diameter(b,c)),key=lambda p:p[2])
        bb,cc=bx*bx+by*by,cx*cx+cy*cy
        x=(cy*bb-by*cc)/d
        y=(bx*cc-cx*bb)/d
        return (a[0]+x,a[1]+y,math.hypot(x,y))
    circle=None
    for i,p in enumerate(points):
        if outside(p,circle):
            circle=(p[0],p[1],0)
            for j,q in enumerate(points[:i]):
                if outside(q,circle):
                    circle=diameter(p,q)
                    for r in points[:j]:
                        if outside(r,circle):
                            circle=circumcircle(p,q,r)
    return circle


def circular_panel(scene,name,circle):
    """Fill the circle using real projected surfaces, with a small ink gap."""
    cx,cy,r=circle
    root=panel(scene,name,cx-r,cy-r,2*r,2*r)
    bpy.context.view_layer.update()
    points=[]
    for ob in root.children:
        for p in VERTEX_CACHE[ob.data.as_pointer()]:
            world=ob.matrix_world @ p
            points.append((world.x,world.y))
    mx,my,mr=enclosing_circle(points)
    # Verify the numerical enclosure before applying its scale.
    mr=max(mr,max(math.hypot(x-mx,y-my) for x,y in points))
    factor=(r-12)/mr
    root.matrix_world=(Matrix.Translation((cx,H-cy,0)) @ Matrix.Scale(factor,4)
                       @ Matrix.Translation((-mx,-my,0)) @ root.matrix_world)
    root['fit_circle']=json.dumps(list(circle))
    root['circle_clearance']=12
    LAYOUT[-1]['scale']*=factor
    LAYOUT[-1]['circular_fit']=dict(circle=list(circle),clearance=12)
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
        main=panel(scene,'main-'+kind,35,195,1180,790)
        circles=[(1640,386,208),(1640,846,208)]
        align=circular_panel(scene,'close-'+key+'-align',circles[0])
        text(scene,'ANTENNA PLUG / ENLARGED',1290,145,28,True)
        text(scene,'Center it over the socket.',1440,606,28)
        seated=circular_panel(scene,'close-'+key+'-seated',circles[1])
        text(scene,'Press straight down until seated.',1350,1064,28)
        detail_callout(scene,'RF plug detail',main,rf_landmarks(XRF if key=='xiao' else WRF),
                       circles,[align,seated],
                       via=(lambda cx,cy,rx,ry:[(cx+rx*.5,160),(1225,160),(1225,386)]) if key=='xiao'
                       else (lambda cx,cy,rx,ry:[(1225,cy-ry*.5),(1225,386)]),
                       source_angle=-60 if key=='xiao' else -30,ring_scale=.55)
        text(scene,'Keep the plug level. Press the metal cap, not the cable.',65,1062,31)
    scene = new_page(4,'Join the boards')
    header(scene,'04  JOIN THE BOARDS','Wio above XIAO. Keep both antennas connected and both shields facing up.')
    text(scene,'ALIGN THE BOARDS',65,180,34,True)
    text(scene,'REAR CONNECTOR',850,180,32,True)
    text(scene,'JOINED',1510,180,34,True)
    main=panel(scene,'main-exploded',20,250,790,690)
    circle=(1120,600,320)
    enlarged=circular_panel(scene,'close-b2b',circle)
    panel(scene,'main-assembled',1435,280,515,630)
    text(scene,'Wio underside',1010,240,27)
    text(scene,'XIAO top',1060,942,27)
    text(scene,'Align the small connector,',65,985,30)
    text(scene,'then press straight down.',65,1030,30)
    text(scene,'XIAO socket shown simplified.',855,1007,24,muted=True)
    text(scene,'Side header pins point down.',1450,1007,27)
    detail_callout(scene,'Board connector detail',main,B2B_LANDMARKS,
                   [circle],[enlarged],source_angle=0,
                   via=lambda cx,cy,rx,ry:[(775,cy),(775,600)])
    scene = new_page(5,'All steps 01-04')
    header(scene,'MESH KIT  /  STEPS 01-04','XIAO ESP32S3 + Wio-SX1262')
    text(scene,'01  CHECK THE PARTS',65,177,36,True)
    for name,x in [('part-xiao',45),('part-wio',285),('part-wifi',525),('part-lora',765)]:
        panel(scene,name,x,242,220,270)
    for label,x in [('A  XIAO',65),('B  Wio',315),('C  Wi-Fi',550),('D  LoRa',790)]:
        text(scene,label,x,533,28)
    text(scene,'02  CONNECT WI-FI',1055,177,36,True)
    main=panel(scene,'main-wifi',1025,242,560,315)
    circle=(1780,405,180)
    enlarged=circular_panel(scene,'close-xiao-align',circle)
    detail_callout(scene,'Wi-Fi plug detail',main,rf_landmarks(XRF),
                   [circle],[enlarged],
                   via=lambda cx,cy,rx,ry:[(cx-rx,235),(1565,235),(1565,330)],
                   target_y=330,source_angle=-135,padding=8,ring_scale=.55)
    text(scene,'Broad antenna to XIAO. Press straight down.',1055,597,28)
    text(scene,'03  CONNECT LORA',65,641,36,True)
    main=panel(scene,'main-lora',35,700,550,322)
    circle=(785,865,180)
    enlarged=circular_panel(scene,'close-wio-align',circle)
    detail_callout(scene,'LoRa plug detail',main,rf_landmarks(WRF),
                   [circle],[enlarged],
                   via=lambda cx,cy,rx,ry:[(565,cy-ry*.5),(565,835)],
                   target_y=835,source_angle=-30,padding=8,ring_scale=.55)
    text(scene,'Narrow antenna to Wio. Press straight down.',65,1060,28)
    text(scene,'04  JOIN THE BOARDS',1055,641,36,True)
    main=panel(scene,'main-exploded',1020,713,540,310)
    circle=(1770,865,185)
    enlarged=circular_panel(scene,'close-b2b',circle)
    detail_callout(scene,'Board connector detail',main,B2B_LANDMARKS,
                   [circle],[enlarged],
                   via=lambda cx,cy,rx,ry:[(1560,cy),(1560,860)],
                   target_y=860,source_angle=0,padding=8)
    text(scene,'Wio above XIAO. Press straight down.',1055,1060,28)
    text(scene,'XIAO socket simplified.',1610,1090,20,muted=True)
    return scene

