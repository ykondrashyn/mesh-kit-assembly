#!/usr/bin/env python3
"""Build a portable, fully keyed Blender assembly animation.

blender --background --factory-startup --python build_animation.py
All rendered artwork is native Blender geometry. No frame handlers are needed.
"""
from pathlib import Path
import json
import math
import sys

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parent
sys.path.insert(0, str(SOURCE))
import geometry as g
from transitions import WhiteFade, envelope, smoother
import bpy
from mathutils import Matrix, Vector

g.load_cad()
g.load_plug()
scene = bpy.context.scene
scene.name = 'Assembly showcase / 15 seconds'
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1920
scene.render.resolution_y = 1080
scene.render.resolution_percentage = 100
scene.render.fps = 30
scene.frame_start = 1
scene.frame_end = 450
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.image_settings.compression = 30
scene.render.filepath = '//frames/frame-'
scene.render.film_transparent = False
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
if hasattr(scene.eevee, 'taa_render_samples'):
    scene.eevee.taa_render_samples = 64
world = bpy.data.worlds.new('White studio')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (1, 1, 1, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1
scene.world = world


def link(ob, parent=None):
    scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, parent=None):
    return link(bpy.data.objects.new(name, None), parent)


def attach(objects, root):
    for ob in objects:
        link(ob, root)
    return objects


def key(ob, prop, frame):
    ob.keyframe_insert(data_path=prop, frame=frame)


def visibility(objects, visible, frame):
    for ob in objects:
        ob.hide_render = not visible
        ob.hide_viewport = not visible
        key(ob, 'hide_render', frame)
        key(ob, 'hide_viewport', frame)


def smooth(t, a, b):
    v = min(1, max(0, (t-a)/(b-a)))
    return v*v*(3-2*v)


def mix(a, b, v):
    return Vector(a).lerp(Vector(b), v)


def orbit(azimuth, elevation):
    az, el = math.radians(azimuth), math.radians(elevation)
    c, s, ce, se = math.cos(az), math.sin(az), math.cos(el), math.sin(el)
    return Matrix(((c, -s, 0), (s*se, c*se, ce), (-s*ce, -c*ce, se)))


def cable_points(curve, points, frame):
    a, b, c, d = [Vector(p) for p in points]
    p, q = curve.data.splines[0].bezier_points
    p.co, p.handle_right, p.handle_left = a, b, 2*a-b
    q.co, q.handle_left, q.handle_right = d, c, 2*d-c
    for point in (p, q):
        for prop in ('co', 'handle_left', 'handle_right'):
            point.keyframe_insert(data_path=prop, frame=frame)


def polyline(name, points, thickness=1.7, mat='ink', closed=False, parent=None):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = thickness/2
    cu.bevel_resolution = 2
    sp = cu.splines.new('POLY')
    sp.points.add(len(points)-1)
    for p, v in zip(sp.points, points):
        p.co = (*v, 1)
    sp.use_cyclic_u = closed
    cu.materials.append(g.MATERIALS[mat])
    return link(bpy.data.objects.new(name, cu), parent)


def circle(name, x, y, r, z=10, parent=None):
    return polyline(name, [(x+r*math.cos(i*math.tau/128), y+r*math.sin(i*math.tau/128), z)
                          for i in range(128)], 2.1, closed=True, parent=parent)


def label(body, x, y, size, parent, centered=False, muted=False):
    ob = g.local_text(body, (x, y, 80), size/0.72, 'muted' if muted else 'ink', bold=not muted)
    if not centered:
        ob.data.align_x = 'LEFT'
    return link(ob, parent)


for name, rotation, energy in [('Key light', (.25, -.35, -.25), 2.5), ('Fill light', (-.6, .8, 1), .7)]:
    data = bpy.data.lights.new(name, 'SUN')
    data.energy = energy
    data.angle = .20
    ob = link(bpy.data.objects.new(name, data))
    ob.rotation_euler = rotation

camera_data = bpy.data.cameras.new('Assembly orbit camera')
camera = link(bpy.data.objects.new('Assembly orbit camera', camera_data))
camera_data.type = 'ORTHO'
camera_data.clip_start = .1
camera_data.clip_end = 2000
scene.camera = camera

# A camera-attached native 3D layout keeps type and inset circles stable.
hud = empty('Camera-space layout / units in pixels', camera)
hud['purpose'] = 'Native Blender text, circular detail geometry and tracking leaders'
boards = {}
for kind in ('xiao', 'wio'):
    root = empty(kind.upper()+' / board motion')
    attach(g.board(kind), root)
    boards[kind] = root

films, plugs, cables = {}, {}, {}
film_bases = {'wifi': Vector((36, -5, 0)), 'lora': Vector((-36, -8, 5))}
for kind in ('wifi', 'lora'):
    films[kind] = empty(kind+' / antenna film motion')
    attach(g.antenna_body(kind, (0, 0, 0)), films[kind])
    films[kind].location = film_bases[kind]
    plugs[kind] = empty(kind+' / plug motion')
    attach(g.plug(kind, (0, 0, 0)), plugs[kind])
    cables[kind] = link(g.cable(kind+' / animated coax', [(0, 0, 0)]*4, g.PLUG_SPECS[kind]['radius']))

titles = []
for text in ['01  CHECK THE PARTS', '02  CONNECT WI-FI', '03  CONNECT LORA', '04  JOIN THE BOARDS', 'ASSEMBLED']:
    titles.append(label(text, -884, 448, 40, hud))
label('XIAO ESP32S3 + Wio-SX1262', -884, 392, 24, hud, muted=True)
polyline('Header divider', [(-884, 353, 50), (884, 353, 50)], 1, 'rule', parent=hud)
captions = []
for text in ['Two boards. Two antennas.', 'Broad antenna to XIAO. Press straight down.',
             'Narrow antenna to Wio. Press straight down.', 'Rear view. Align the small connector, then press down.',
             'Both antennas connected. Boards joined.']:
    captions.append(label(text, -884, -430, 31, hud))

# Four unobtrusive progress segments retain the manual step numbering.
bars = []
for i in range(4):
    x = -884+i*441
    polyline('Progress track '+str(i+1), [(x, -488, 60), (x+420, -488, 60)], 3, 'rule', parent=hud)
    bars.append(polyline('Progress '+str(i+1), [(x, -488, 61), (x, -488, 61)], 3, parent=hud))

INSET_X, INSET_Y, INSET_R = 610, 25, 252
frame = circle('Circular magnification frame', INSET_X, INSET_Y, INSET_R, 65, hud)
paperverts = [(INSET_X, INSET_Y, -150)]+[(INSET_X+INSET_R*math.cos(i*math.tau/128), INSET_Y+INSET_R*math.sin(i*math.tau/128), -150) for i in range(128)]
paper = link(g.object_from_mesh('Circular inset white backing', paperverts,
                  [(0, i+1, (i+1)%128+1) for i in range(128)], 'paper'), hud)
source_ring = circle('Connector source ring', 0, 0, 34, 70, hud)
leader = polyline('Unarrowed magnification leader', [(0, 0, 66)]*4, 1.6, parent=hud)
leader_halo = polyline('Leader white clearance', [(0, 0, 64)]*4, 5.4, 'paper', parent=hud)
source_ring['callout_role'] = 'source_ring'
leader['arrowhead'] = False
frame['callout_role'] = 'frame'
frame['diameter_pixels'] = INSET_R*2

details = {}
for kind, board in [('wifi', 'xiao'), ('lora', 'wio')]:
    root = empty(kind+' / synchronized circular detail', hud)
    static = attach(g.box(kind+' PCB context', (-3.8, -2.7, -.55), (7.6, 5.4, .55), 'pcb')+g.detail(board+'-rf'), root)
    plug = empty(kind+' / detail plug', root)
    plug_obs = attach(g.plug(kind, (0, 0, 0)), plug)
    cable = link(g.cable(kind+' / detail coax', [(0, 0, 0)]*4, g.PLUG_SPECS[kind]['radius']), root)
    text = label('WI-FI CONNECTOR' if kind=='wifi' else 'LORA CONNECTOR', INSET_X, 337, 23, hud, centered=True)
    instruction = label('Align. Press straight down.', INSET_X, -278, 24, hud, centered=True, muted=True)
    details[kind] = dict(root=root, static=static, plug=plug, cable=cable,
                         objects=static+plug_obs+[cable, text, instruction])

root = empty('Board connector / synchronized circular detail', hud)
static = attach(g.box('Lower PCB context', (-5.5, -2.6, -.55), (11, 5.2, .55), 'pcb')+g.detail('xiao-b2b'), root)
upper = empty('Board connector / upper half', root)
moving = attach(g.box('Upper PCB context', (-5.5, -2.6, 0), (11, 5.2, .55), 'pcb')+g.detail('wio-b2b'), upper)
text = label('BOARD CONNECTOR / REAR', INSET_X, 337, 23, hud, centered=True)
instruction = label('XIAO socket shown simplified.', INSET_X, -278, 23, hud, centered=True, muted=True)
details['b2b'] = dict(root=root, upper=upper, objects=static+moving+[text, instruction])


def projected_geometry(objects, transform):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for ob in objects:
        if ob.type not in ('MESH', 'CURVE', 'FONT'):
            continue
        ev = ob.evaluated_get(graph)
        mesh = ev.to_mesh()
        try:
            for vertex in mesh.vertices:
                points.append(transform @ (ob.matrix_local @ vertex.co))
        finally:
            ev.to_mesh_clear()
    return points


# Fixed inset fits use the union of alignment and seated poses, preventing zoom jitter.
detail_rot = orbit(-24, 34)
for kind in ('wifi', 'lora'):
    d = details[kind]
    points = projected_geometry(d['static'], detail_rot)
    plane = 1.25 if kind=='wifi' else 1.30
    for lift, offset in [(3.8, (2 if kind=='wifi' else -2, -1.5, 0)), (3.8, (0, 0, 0)), (0, (0, 0, 0))]:
        cap = Vector(offset)+Vector((0, 0, plane+lift))
        for ob in d['plug'].children:
            points.extend([detail_rot @ (ob.matrix_local @ Vector(c)+cap) for c in ob.bound_box])
        join = cap+Vector(g.PLUG_SPECS[kind]['join'])
        points += [detail_rot @ (join+Vector(v)) for v in [(0,0,0),(0,2,0),(1.4,2.7,0)]]
    cx, cy, radius = g.enclosing_circle([(p.x, p.y) for p in points])
    scale = (INSET_R-20)/radius
    d['root'].matrix_basis = Matrix.Translation((INSET_X-scale*cx, INSET_Y-scale*cy, 0)) @ detail_rot.to_4x4() @ Matrix.Scale(scale, 4)
    d['root']['fixed_fit_scale'] = scale
    d['base_location'] = d['root'].location.copy()
    d['fit_scale'] = scale

d = details['b2b']
b2b_rot = orbit(159, 26)
pts = []
for z in [-.55, 0, 12.75, 13.3]:
    pts += [b2b_rot@Vector((x,y,z)) for x in (-5.5,5.5) for y in (-2.6,2.6)]
cx, cy, radius = g.enclosing_circle([(p.x, p.y) for p in pts])
scale = (INSET_R-20)/radius
d['root'].matrix_basis = Matrix.Translation((INSET_X-scale*cx, INSET_Y-scale*cy, 0)) @ b2b_rot.to_4x4() @ Matrix.Scale(scale,4)
d['base_location'] = d['root'].location.copy()
d['fit_scale'] = scale

# Conservative geometry samples drive camera framing, including the flexible leads.
board_bounds = {}
for name in ('xiao', 'wio'):
    vertices = [p for asset in g.ASSETS.values() for p in asset['record']['vertices']
                if asset['record'].get('board')==name and asset['record'].get('category') in ('official_board','supplemental_board')]
    lo = [min(p[i] for p in vertices)-.1 for i in range(3)]
    hi = [max(p[i] for p in vertices)+.1 for i in range(3)]
    board_bounds[name] = [Vector((x,y,z)) for x in (lo[0],hi[0]) for y in (lo[1],hi[1]) for z in (lo[2],hi[2])]

# Each opening part has a readable camera-facing name, independent of the chip print.
part_label_text={'lora':'LoRa antenna\n868 MHz','wio':'Wio-SX1262',
                 'wifi':'Wi-Fi antenna\n2.4 GHz','xiao':'XIAO ESP32S3'}
part_labels={}
for kind,body in part_label_text.items():
    ob=link(g.local_text(body,(0,0,80),30/.72,'ink',bold=False),hud)
    ob.name='Opening part label / '+kind
    ob['part_label']=kind
    part_labels[kind]=ob
part_label_starts={kind:.2*i for i,kind in enumerate(part_label_text)}
part_fades={kind:WhiteFade('Opening part name / '+kind,[ob]) for kind,ob in part_labels.items()}
stage_fades=[WhiteFade('Step '+str(i+1)+' typography',[title,caption])
             for i,(title,caption) in enumerate(zip(titles,captions))]
callout_fade=WhiteFade('Circular callout',[frame,paper])
tracking_fade=WhiteFade('Tracking callout',[source_ring,leader,leader_halo],transparent=True)
detail_fades={kind:WhiteFade(kind+' close-up',d['objects']) for kind,d in details.items()}

# Each RF step shows only its board and antenna. Both return for stacking.
pair_fades={}
for kind,board_kind in [('wifi','xiao'),('lora','wio')]:
    objects=list(boards[board_kind].children)+list(films[kind].children)+list(plugs[kind].children)+[cables[kind]]
    for ob in objects:
        ob['assembly_pair']=kind
    pair_fades[kind]=WhiteFade(kind+' main assembly pair',objects)


# A separate opening pose presents complete, unconnected parts in a clear order.
# Each offset is solved in the tabletop plane to align projected centers.
opening_rotation = orbit(-28, 41)
opening_plane = Matrix(((opening_rotation[0][0],opening_rotation[0][1]),
                        (opening_rotation[1][0],opening_rotation[1][1]))).inverted()
opening_order = ['lora','wio','wifi','xiao']
opening_targets = [(-72,0),(-24,0),(24,0),(72,0)]
opening_centers = {'lora':Vector((3.5,13.5,.5)),
                   'wio':Vector((8.89,10.8,1.5)),
                   'wifi':Vector((8.75,12.2,.5)),
                   'xiao':Vector((8.89,10.8,1.5))}
opening_positions = {}
for name,xy in zip(opening_order,opening_targets):
    center = opening_rotation @ opening_centers[name]
    delta = opening_plane @ (Vector(xy)-Vector((center.x,center.y)))
    opening_positions[name] = Vector((delta.x,delta.y,0))

audit = []
camera_fits = []
for f in range(1, 451):
    t = (f-1)/30
    stage = 0 if t<1.5 else 1 if t<5 else 2 if t<8.5 else 3 if t<12.5 else 4
    deploy = smooth(t, 1.1, 2.6)
    glide = math.sin(math.pi*deploy) if 0<deploy<1 else 0
    xiao = mix(opening_positions['xiao'],(0,0,0),deploy)
    bypass = opening_plane @ Vector((35,-60))
    xiao += Vector((bypass.x,bypass.y,32))*glide
    boards['xiao'].location = xiao
    key(boards['xiao'],'location',f)
    board_move = smooth(t, 9.3, 10.2)
    wio_start = mix(opening_positions['wio'],(-28,28,0),deploy)
    wio = mix(wio_start, (0, 0, 0), board_move)
    wio.z = 8*glide+14*smooth(t, 8.5, 9.3)-9*smooth(t, 10.6, 11.8)
    boards['wio'].location = wio
    key(boards['wio'], 'location', f)
    active = None
    if stage==1 and t>=2.6:
        active = 'wifi'
    elif stage==2:
        active = 'lora'
    elif stage==3 and t>=10.2:
        active = 'b2b'

    part_points={'xiao':[p+xiao for p in board_bounds['xiao']],
                 'wio':[p+wio for p in board_bounds['wio']]}
    main_points = part_points['xiao']+part_points['wio']
    for kind, start, press_start, press_end, rf in [('wifi', 1.5, 3.1, 4.3, g.XRF), ('lora', 5, 6.6, 7.8, g.WRF)]:
        alignment = 1-smooth(t, start, start+1)
        offset = Vector(((2 if kind=='wifi' else -2)*alignment, -1.5*alignment, 0))
        lift = 3.8*(1-smooth(t, press_start, press_end))
        film_base = mix(opening_positions[kind],film_bases[kind],deploy)
        films[kind].location = film_base
        key(films[kind],'location',f)
        origin = xiao if kind=='wifi' else wio
        parked_cap = film_base+Vector((4.75,-13,1.5) if kind=='wifi' else (-.5,-13,1.5))
        cap = mix(parked_cap,origin+Vector(rf)+offset+Vector((0,0,lift)),deploy)
        cap.z += 7*glide
        plugs[kind].location = cap
        key(plugs[kind], 'location', f)
        feed = film_base+Vector((8.75,18.7,.5) if kind=='wifi' else (3.5,3,.5))
        join = cap+Vector(g.PLUG_SPECS[kind]['join'])
        handle = Vector((-12,9,2) if kind=='wifi' else (-8,22,3))
        handle.z += (6 if kind=='wifi' else 30)*smooth(t,8.5,10.2)
        handle = mix((5,-9,.5),handle,deploy)
        control = [join, join+Vector((0,6+7*deploy,0)), feed+handle, feed]
        cable_points(cables[kind], control, f)
        part_start=len(main_points)
        width,length = (17.5,37.4) if kind=='wifi' else (7,40)
        main_points += [film_base+Vector((x,y,z)) for x in (0,width) for y in (0,length) for z in (0,.7)]
        main_points += [cap+Vector((x,y,z)) for x in (-2,2) for y in (-2,8) for z in (-1.25,2)]
        a,b,c,d = control
        for j in range(33):
            u = j/32
            point = a*(1-u)**3+3*b*u*(1-u)**2+3*c*u*u*(1-u)+d*u**3
            main_points += [point+Vector((dx,dy,dz)) for dx,dy,dz in [(-.7,0,0),(.7,0,0),(0,-.7,0),(0,.7,0),(0,0,-.7),(0,0,.7)]]
        part_points[kind]=main_points[part_start:]
        d = details[kind]
        detail_cap = offset+Vector((0,0,(1.25 if kind=='wifi' else 1.30)+lift))
        shift = detail_rot @ Vector((0,0,(3.8-lift)*.5))
        d['root'].location = d['base_location']+shift*d['fit_scale']
        key(d['root'], 'location', f)
        d['plug'].location = detail_cap
        key(d['plug'], 'location', f)
        dj = detail_cap+Vector(g.PLUG_SPECS[kind]['join'])
        cable_points(d['cable'], [dj, dj+Vector((0,.9,0)), dj+Vector((.8,1.5,0)), dj+Vector((1.4,2.2,0))], f)

    # The inset uses the same physical board separation after lateral alignment.
    details['b2b']['root'].location = details['b2b']['base_location']+(b2b_rot @ Vector((0,0,(14-wio.z)*.5)))*details['b2b']['fit_scale']
    key(details['b2b']['root'], 'location', f)
    details['b2b']['upper'].location.z = wio.z-1.25
    key(details['b2b']['upper'], 'location', f)

    pair_amounts={'wifi':1-smoother(t,4.65,5)+smoother(t,8.5,8.85),
                  'lora':1-smoother(t,1.28,1.5)+smoother(t,5,5.35)}
    for kind,group in pair_fades.items():
        group.set(pair_amounts[kind],f)
    focus_weights={'wifi':smoother(t,1.5,2.6)*(1-smoother(t,4.4,5)),
                   'lora':smoother(t,5,5.6)*(1-smoother(t,8,8.5))}

    panel_amount = smoother(t, 1.8, 2.6)*(1-smoother(t, 12.5, 14))
    azimuth = -28+7*smooth(t, 0, 8.5)*deploy+180*smoother(t, 8.5, 10.2)-180*smoother(t, 12.5, 14)
    elevation = 41-15*smoother(t, 8.5, 10.2)+15*smoother(t, 12.5, 14)
    rotation = orbit(azimuth, elevation)
    camera.rotation_euler = rotation.transposed().to_euler()
    # Fit full geometry into a protected artwork area below the header.
    projected = [rotation @ p for p in main_points]
    lo = Vector((min(p.x for p in projected), min(p.y for p in projected), 0))
    hi = Vector((max(p.x for p in projected), max(p.y for p in projected), 0))
    projected_center = (lo+hi)/2
    width = 1768-638*panel_amount
    pixel_scale = max((hi.x-lo.x)/width, (hi.y-lo.y)/670)*1.045
    full_center=projected_center.copy()
    full_scale=pixel_scale
    for kind,board_kind in [('wifi','xiao'),('lora','wio')]:
        points=[rotation @ p for p in part_points[kind]+part_points[board_kind]]
        low=Vector((min(p.x for p in points),min(p.y for p in points),0))
        high=Vector((max(p.x for p in points),max(p.y for p in points),0))
        pair_center=(low+high)/2
        pair_scale=max((high.x-low.x)/width,(high.y-low.y)/670)*1.065
        weight=focus_weights[kind]
        projected_center+=(pair_center-full_center)*weight
        pixel_scale+=(pair_scale-full_scale)*weight
    if t<=12.5:
        final_start_scale = pixel_scale
    else:
        pixel_scale = final_start_scale
    pixel_scale *= 1+.06*smoother(t,12.5,14)
    pixel_scale *= 1+.035*(1-smooth(t,0,1.1))
    ortho = pixel_scale*1920
    target_x = 960-315*panel_amount
    target_y = 525
    camera.location = rotation.transposed() @ Vector((projected_center.x-(target_x-960)*pixel_scale,
                                                        projected_center.y-(target_y-540)*pixel_scale, 500))
    camera_data.ortho_scale = ortho
    key(camera, 'location', f)
    key(camera, 'rotation_euler', f)
    key(camera_data, 'ortho_scale', f)
    hud.location = (0, 0, -200)
    hud.scale = (pixel_scale,)*3
    key(hud, 'scale', f)

    # Fade one step out before bringing the next in, avoiding overlapping text.
    stage_amounts=[envelope(t,a,b,.28,.22) for a,b in
                   [(None,1.5),(1.5,5),(5,8.5),(8.5,12.5),(12.5,None)]]
    for group,amount in zip(stage_fades,stage_amounts):
        group.set(amount,f)
    detail_amounts={'wifi':envelope(t,2.6,5),
                    'lora':envelope(t,5,8.5),
                    'b2b':envelope(t,10.2,12.5)}
    callout_amount=max(detail_amounts.values())
    callout_fade.set(callout_amount,f)
    tracking_fade.set(callout_amount,f)
    for kind,group in detail_fades.items():
        group.set(detail_amounts[kind],f)
    label_amount=1-smoother(t,1.15,1.5)
    part_label_amounts={kind:smoother(t,start,start+.16)*label_amount
                       for kind,start in part_label_starts.items()}
    for kind,group in part_fades.items():
        group.set(part_label_amounts[kind],f)
    projected_parts={kind:[rotation@(p-camera.location)/pixel_scale for p in points]
                     for kind,points in part_points.items()}
    common_bottom=min(p.y for points in projected_parts.values() for p in points)
    for kind,ob in part_labels.items():
        points=projected_parts[kind]
        center_x=(min(p.x for p in points)+max(p.x for p in points))/2
        bottom=min(p.y for p in points)
        if scene.render.resolution_y>scene.render.resolution_x:
            label_y=bottom-(76 if '\n' in ob.data.body else 58)
        else:
            label_y=common_bottom-88
        ob.location=(center_x,label_y,80)
        key(ob,'location',f)
    for i, (a,b) in enumerate([(0,1.5),(1.5,5),(5,8.5),(8.5,12.5)]):
        amount = max(0,min(1,(t-a)/(b-a)))
        point = bars[i].data.splines[0].points[1]
        point.co.x = -884+i*441+420*amount
        point.keyframe_insert(data_path='co',frame=f)

    if active:
        if active=='wifi':
            tracked = xiao+Vector(g.XRF)
        elif active=='lora':
            tracked = wio+Vector(g.WRF)
        else:
            tracked = Vector((6.7307,21.123,(1.25+wio.z-.1)/2))
        projected = rotation @ (tracked-camera.location)
        sx, sy = projected.x/pixel_scale, projected.y/pixel_scale
        ring_radius = 34
        if active=='b2b':
            corners = [Vector((x,21.123,z))-tracked for x in (2.431,11.031) for z in (1.25,wio.z-.1)]
            ring_radius = max(34,max(math.hypot((rotation@p).x,(rotation@p).y) for p in corners)/pixel_scale+10)
        source_ring.scale = (ring_radius/34,ring_radius/34,1)
        key(source_ring, 'scale', f)
        source_ring.location = (sx,sy,0)
        key(source_ring, 'location', f)
        # Route above the assembly before meeting the inset's left edge.
        route = [(sx+ring_radius,sy,66),(310,sy,66),(310,INSET_Y,66),(INSET_X-INSET_R,INSET_Y,66)]
        for ob in (leader,leader_halo):
            for p,v in zip(ob.data.splines[0].points,route):
                p.co = (v[0],v[1],66 if ob==leader else 64,1)
                p.keyframe_insert(data_path='co',frame=f)
    audit.append(dict(frame=f,time=t,stage=stage,inset=active,wio=list(wio),xiao=list(xiao),
                       wifi_film=list(films['wifi'].location),lora_film=list(films['lora'].location),opening_deploy=deploy,
                       wifi_plug=list(plugs['wifi'].location),lora_plug=list(plugs['lora'].location),
                       part_label_opacity=label_amount,part_label_opacities=part_label_amounts,stage_opacities=stage_amounts,detail_opacities=detail_amounts,
                       pair_opacities=pair_amounts,focus_weights=focus_weights,
                       camera_location=list(camera.location),camera_rotation=list(camera.rotation_euler),camera_ortho_mm=ortho,camera_azimuth_degrees=azimuth,camera_elevation_degrees=elevation))

# Every frame is baked, linear interpolation prevents inter-frame overshoot.
for action in bpy.data.actions:
    for layer in action.layers:
        for strip in layer.strips:
            if strip.type!='KEYFRAME':
                continue
            for bag in strip.channelbags:
                for curve in bag.fcurves:
                    for point in curve.keyframe_points:
                        point.interpolation = 'CONSTANT' if curve.data_path in ('hide_render','hide_viewport') else 'LINEAR'

for frame_num,name in [(1,'01 Parts'),(46,'02 Wi-Fi'),(151,'03 LoRa'),(256,'04 Boards'),(376,'Assembled'),(421,'Final hold')]:
    scene.timeline_markers.new(name,frame=frame_num)
scene['authoring'] = 'Native Blender geometry, animation, camera-space circular detail views and typography'
scene['ai_image_generation'] = False
scene['external_image_inputs'] = 0
scene['opening_order'] = 'LoRa antenna, Wio-SX1262, Wi-Fi antenna, XIAO ESP32S3'
scene['opening_layout'] = 'vertical' if scene.render.resolution_y>scene.render.resolution_x else 'horizontal'
scene['opening_transition_seconds'] = '1.1 to 2.6'
scene['opening_labels'] = json.dumps(part_label_text)
scene['transition_style'] = 'Native white dissolves and quintic camera easing'
scene['changed_render_ranges'] = '1-24'
scene['opening_label_starts_seconds'] = json.dumps(part_label_starts)
scene['opening_label_fade_seconds'] = .16
scene['rf_step_framing'] = 'Step 2 shows Wi-Fi and XIAO only, step 3 shows LoRa and Wio only, both return for stacking'
scene['rf_source'] = 'Representative I-PEX MHF I 1.13 mm and 1.37 mm CAD. Exact kit supplier unverified.'
scene['socket_note'] = 'XIAO socket simplified, nominal 5 mm joined board spacing'
scene['cm_note'] = 'C M marking based on user observation. Meaning unverified.'
scene.frame_set(450)
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type=='VIEW_3D':
            area.spaces.active.region_3d.view_perspective='CAMERA'
            area.spaces.active.overlay.show_overlays=False
            area.spaces.active.shading.type='MATERIAL'
for text_path in [Path(__file__), SOURCE/'geometry.py', SOURCE/'transitions.py']:
    bpy.data.texts.load(str(text_path))
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'assembly-showcase.blend'),compress=True)
(SOURCE/'motion-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
print('Saved 450-frame native Blender animation',flush=True)
