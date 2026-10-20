#!/usr/bin/env python3
"""Validate baked motion, connector tracking and visual bounds in Blender."""
from pathlib import Path
import hashlib
import json
import math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view

ROOT = Path(__file__).resolve().parent
scene = bpy.context.scene
objects = bpy.data.objects
camera = scene.camera
hud = objects['Camera-space layout / units in pixels']
rf = {'wifi':Vector((13.6167,19.2334,2.5)), 'lora':Vector((5.3984,19.4793,2.9))}
joins = {}
for kind, filename in [('wifi','rf-plug.json.gz'),('lora','rf-plug-137.json.gz')]:
    import gzip
    meta = json.loads(gzip.decompress((ROOT/'geometry-data/meshes'/filename).read_bytes()))['metadata']
    joins[kind] = Vector(meta['cable_join']['native_curve_start_mm'])-Vector((0,0,1.25))
assert scene.frame_end==450 and scene.render.fps==30
assert (scene.render.resolution_x,scene.render.resolution_y)==(1080,1920)
assert not scene.render.film_transparent
assert not [ob for ob in objects if ob.type=='IMAGE']
for kind,body in [('wifi','Wi-Fi\n2.4 GHz'),('lora','LoRa\n868 MHz')]:
    labels=[ob for ob in objects[kind+' / antenna film motion'].children if ob.type=='FONT']
    assert len(labels)==1 and labels[0].data.body==body
    label=labels[0]
    chip=next(ob for ob in objects if ob.type=='FONT' and ob.data.body=='ESP32-S3')
    assert label.data.font==chip.data.font
    assert label.data.materials[0]==chip.data.materials[0]
    width,length=(17.5,37.4) if kind=='wifi' else (7,40)
    for corner in label.bound_box:
        v=label.matrix_local@Vector(corner)
        assert 0<v.x<width and 0<v.y<length,(kind,list(v))

for name, count in [('XIAO',37),('WIO',9)]:
    root = objects[name+' / board motion']
    assert sum(ob.get('category')=='official_board' for ob in root.children)==count


def screen(point):
    p = view_matrix @ point
    return Vector((540+p.x*view_scale,960+p.y*view_scale))


def hull(points):
    p = sorted(set(tuple(v) for v in points))
    def cross(a,b,c):
        return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
    halves=[]
    for part in (p,p[::-1]):
        h=[]
        for v in part:
            while len(h)>1 and cross(h[-2],h[-1],v)<=0:
                h.pop()
            h.append(v)
        halves.append(h[:-1])
    return halves[0]+halves[1]


def distance(p, polygon):
    inside=True
    minimum=float('inf')
    for a,b in zip(polygon,polygon[1:]+polygon[:1]):
        a,b=Vector(a),Vector(b)
        if (b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x)<0:
            inside=False
        edge=b-a
        t=max(0,min(1,(p-a).dot(edge)/edge.length_squared)) if edge.length_squared else 0
        minimum=min(minimum,(p-a-t*edge).length)
    return -minimum if inside else minimum


errors=[]
worst_join=0
worst_tracking=0
min_film=float('inf')
min_cable=float('inf')
min_cable_world=float('inf')
connector_visibility=[]
main_bounds=[]
inset_bounds=[]
main_objects=[ob for ob in scene.objects if not ob.parent or ob.parent.name.endswith('/ board motion') or ob.parent.name.endswith('/ antenna film motion') or ob.parent.name.endswith('/ plug motion')]
main_objects=[ob for ob in main_objects if ob.type in ('MESH','CURVE','FONT') and not ob.name.startswith(('Camera','Header'))]
xiao=objects['XIAO / board motion']
xiao_points=[ob.matrix_local@v.co for ob in xiao.children if ob.type=='MESH' for v in ob.data.vertices]
world_vertices=[]
world_faces=[]
for ob in xiao.children:
    if ob.type!='MESH':
        continue
    base=len(world_vertices)
    world_vertices.extend(ob.matrix_world@v.co for v in ob.data.vertices)
    world_faces.extend(tuple(base+i for i in p.vertices) for p in ob.data.polygons)
xiao_bvh=BVHTree.FromPolygons(world_vertices,world_faces)
for f in range(1,451):
    scene.frame_set(f)
    bpy.context.view_layer.update()
    view_matrix=camera.matrix_world.inverted()
    view_scale=1920/camera.data.ortho_scale
    t=(f-1)/30
    wio=objects['WIO / board motion'].location.copy()
    xiao_offset=objects['XIAO / board motion'].location.copy()
    for kind in ('wifi','lora'):
        cap=objects[kind+' / plug motion'].location.copy()
        cable=objects[kind+' / animated coax']
        p,q=cable.data.splines[0].bezier_points
        worst_join=max(worst_join,(p.co-cap-joins[kind]).length)
        direction=(p.handle_right-p.co).normalized()
        assert direction.dot(Vector((0,1,0)))>.99999
        expected_feed=objects[kind+' / antenna film motion'].location+Vector((8.75,18.7,.5) if kind=='wifi' else (3.5,3,.5))
        assert (q.co-expected_feed).length<1e-4
        if t>=(4.3 if kind=='wifi' else 7.8):
            expected=rf[kind]+(xiao_offset if kind=='wifi' else wio)
            assert (cap-expected).length<1e-4
        detail=objects[kind+' / detail plug'].location
        base=1.25 if kind=='wifi' else 1.30
        origin=rf[kind]+(xiao_offset if kind=='wifi' else wio)
        if t>=2.6:
            assert (detail-Vector((0,0,base))-(cap-origin)).length<1e-4
    if t>=10.2:
        assert abs(wio.x)+abs(wio.y)<1e-4
        assert abs(objects['Board connector / upper half'].location.z-(wio.z-1.25))<1e-4
    if t>=11.8:
        assert abs(wio.z-5)<1e-4
    if not objects['Connector source ring'].hide_render:
        point=xiao_offset+rf['wifi'] if t<5 else wio+rf['lora'] if t<8.5 else Vector((6.7307,21.123,(1.25+wio.z-.1)/2))
        projected=screen(point)
        ring=objects['Connector source ring'].location
        worst_tracking=max(worst_tracking,(projected-Vector((ring.x+540,ring.y+960))).length)
    # Conservative full-board hull, with the cable jacket radius included.
    if f>=307:
        polygon=hull(screen(p) for p in xiao_points)
        film=objects['lora / antenna film motion']
        min_film=min(min_film,*[distance(screen(film.matrix_world@Vector((x,y,z))),polygon)
                               for x in (0,7) for y in (0,40) for z in (0,.7)])
        p,q=objects['lora / animated coax'].data.splines[0].bezier_points
        a,b,c,d=p.co,p.handle_right,q.handle_left,q.co
        radius=.685015*1920/camera.data.ortho_scale
        for j in range(65):
            u=j/64
            v=a*(1-u)**3+3*b*u*(1-u)**2+3*c*u*u*(1-u)+d*u**3
            min_cable=min(min_cable,distance(screen(v),polygon)-radius)
            nearest=xiao_bvh.find_nearest(v)
            min_cable_world=min(min_cable_world,nearest[3]-.685015)
        # The rear view may overlap silhouettes. Check actual cable clearance.
    if 307<=f<=375:
        # Both connector faces must remain visible while the close-up is shown.
        # The final orbit deliberately returns to the front after assembly.
        camera_side=camera.matrix_world.to_3x3()@Vector((0,0,1))
        for role,point,expected in [
            ('lower',Vector((6.7307,21.123,1.7)),'xiao_socket_schematic'),
            ('upper',Vector((6.7307,21.123,wio.z-1.8)),'wio_official_007_b2b_connector')]:
            hit,pos,n,index,ob,m=scene.ray_cast(bpy.context.evaluated_depsgraph_get(),point+camera_side*1000,-camera_side,distance=1010)
            visible=bool(hit and ob.name.startswith(expected))
            connector_visibility.append(dict(frame=f,half=role,visible=visible,hit=ob.name if hit else None))
            if not visible:
                errors.append(dict(frame=f,reason='Mating connector face obscured',half=role,hit=ob.name if hit else None))
    # Actual evaluated outlines at representative connection and transition frames.
    if f in [1,16,34,40,46,55,64,70,76,79,94,115,130,150,151,180,199,220,235,255,256,280,307,319,335,355,375,376,383,390,397,404,411,421,450]:
        graph=bpy.context.evaluated_depsgraph_get()
        pixels=[]
        for ob in main_objects:
            ev=ob.evaluated_get(graph)
            mesh=ev.to_mesh()
            pixels += [screen(ob.matrix_world@v.co) for v in mesh.vertices]
            ev.to_mesh_clear()
        box=[min(p.x for p in pixels),min(p.y for p in pixels),max(p.x for p in pixels),max(p.y for p in pixels)]
        main_bounds.append(dict(frame=f,xyxy=box))
        minimum_y = 900 if not objects['Circular magnification frame'].hide_render else 300
        if not (box[0]>45 and box[1]>minimum_y and box[2]<1035 and box[3]<1700):
            errors.append(dict(frame=f,reason='Main geometry outside protected artwork region',bounds=box))
        if not objects['Circular magnification frame'].hide_render:
            maximum=0
            for ob in scene.objects:
                if ob.type not in ('MESH','CURVE','FONT') or ob.hide_render:
                    continue
                ancestor=ob.parent
                is_detail=False
                while ancestor:
                    if 'synchronized circular detail' in ancestor.name:
                        is_detail=True
                    ancestor=ancestor.parent
                if not is_detail:
                    continue
                ev=ob.evaluated_get(graph)
                mesh=ev.to_mesh()
                for vertex in mesh.vertices:
                    p=screen(ob.matrix_world@vertex.co)
                    maximum=max(maximum,(p-Vector((540,530))).length)
                ev.to_mesh_clear()
            inset_bounds.append(dict(frame=f,maximum_radius_pixels=maximum))
            if maximum>298:
                errors.append(dict(frame=f,reason='Inset geometry intersects circular border',radius=maximum))

assert worst_join<1e-4
assert worst_tracking<.01
assert min_film>0
assert min_cable_world>0
preserved=json.loads((ROOT/'preserved-assets.json').read_text())
available={path:sha for path,sha in preserved.items() if Path(path).is_file()}
assert all(hashlib.sha256(Path(path).read_bytes()).hexdigest()==sha for path,sha in available.items())
report=dict(frames_checked=450,official_solids={'xiao':37,'wio':9},
            cable_endpoint_max_error_mm=worst_join,source_ring_max_error_pixels=worst_tracking,
            lora_film_min_projected_clearance_pixels=min_film,lora_cable_min_projected_clearance_pixels=min_cable,
            lora_cable_min_physical_clearance_mm=min_cable_world,connector_face_visibility=connector_visibility,
            antenna_labels={'wifi':'Wi-Fi / 2.4 GHz','lora':'LoRa / 868 MHz'},
            antenna_font_and_material_match_chip_labels=True,
            opening_order=scene['opening_order'],opening_layout=scene['opening_layout'],
            board_spacing_final_mm=5,main_bounds=main_bounds,inset_bounds=inset_bounds,
            preserved_original_assets=len(available),original_assets_unchanged=True if available else None,errors=errors)
(ROOT/'animation-validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert not errors,errors
print(json.dumps({k:v for k,v in report.items() if k not in ('main_bounds','inset_bounds','connector_face_visibility')},indent=2))
