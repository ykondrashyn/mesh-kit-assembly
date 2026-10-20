"""Check the opening lineup and geometric separation during deployment."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from timing import FRAME_COUNT, HOLD_FRAME, READ_HOLD_FRAMES, source_frame, output_frame
import hashlib
import json
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
source=Path(__file__).resolve().parent
scene=bpy.context.scene
objects=bpy.data.objects
roots={name:objects[name+' / '+role] for name,role in [
    ('lora','antenna film motion'),('WIO','board motion'),
    ('wifi','antenna film motion'),('XIAO','board motion')]}

def tree(root):
    vertices=[]
    polygons=[]
    for ob in root.children:
        if ob.type!='MESH':
            continue
        base=len(vertices)
        vertices.extend(ob.matrix_world@v.co for v in ob.data.vertices)
        polygons.extend(tuple(base+i for i in p.vertices) for p in ob.data.polygons)
    return BVHTree.FromPolygons(vertices,polygons)

def bounds(root):
    vertices=[world_to_camera_view(scene,scene.camera,ob.matrix_world@v.co)
              for ob in root.children if ob.type=='MESH' for v in ob.data.vertices]
    return [min(p.x for p in vertices)*scene.render.resolution_x,
            min(p.y for p in vertices)*scene.render.resolution_y,
            max(p.x for p in vertices)*scene.render.resolution_x,
            max(p.y for p in vertices)*scene.render.resolution_y]
scene.frame_set(1)
bpy.context.view_layer.update()
boxes={name:bounds(root) for name,root in roots.items()}
order=['lora','WIO','wifi','XIAO']
vertical=scene['opening_layout']=='vertical'
gaps=[]
for a,b in zip(order,order[1:]):
    gap=boxes[a][1]-boxes[b][3] if vertical else boxes[b][0]-boxes[a][2]
    assert gap>0,(a,b,gap)
    gaps.append(gap)
rf={'wifi':Vector((13.6167,19.2334,2.5)), 'lora':Vector((5.3984,19.4793,2.9))}
detached={kind:(objects[kind+' / plug motion'].location-roots[board].location-rf[kind]).length
          for kind,board in [('wifi','XIAO'),('lora','WIO')]}
assert min(detached.values())>10
errors=[]
for f in range(1,output_frame(79)+1):
    scene.frame_set(f)
    bpy.context.view_layer.update()
    trees={name:tree(root) for name,root in roots.items()}
    for a,b in [('XIAO','WIO'),('XIAO','wifi'),('XIAO','lora'),('WIO','wifi'),('WIO','lora')]:
        overlaps=trees[a].overlap(trees[b])
        if overlaps:
            errors.append(dict(frame=f,parts=[a,b],intersecting_triangle_pairs=len(overlaps)))
assert objects['XIAO / board motion'].location.length<1e-5
assert (objects['WIO / board motion'].location-Vector((-28,28,0))).length<1e-5
assert not errors,errors
report=dict(opening_order=scene['opening_order'],layout=scene['opening_layout'],
            opening_bounds_pixels=boxes,opening_adjacent_body_gaps_pixels=gaps,
            detached_plug_to_socket_mm=detached,transition_frames_checked=output_frame(79),
            checks='Surface intersections between both board bodies and the antenna films',
            connection_sequence_starts_at_frame=output_frame(79),errors=errors,
            source_blend_sha256=hashlib.sha256((source/'assembly-showcase.blend').read_bytes()).hexdigest())
(source/'opening-validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
