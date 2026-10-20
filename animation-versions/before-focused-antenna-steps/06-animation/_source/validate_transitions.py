"""Validate opening names and native step dissolves in the saved scene."""
from pathlib import Path
import hashlib,json
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
s=bpy.context.scene
root=Path(__file__).resolve().parent
width,height=s.render.resolution_x,s.render.resolution_y
labels={o['part_label']:o for o in s.objects if o.get('part_label')}
assert set(labels)=={'lora','wio','wifi','xiao'}
expected=json.loads(s['opening_labels'])
chip=next(o for o in s.objects if o.type=='FONT' and o.data.body=='ESP32-S3')
for kind,o in labels.items():
    assert o.data.body==expected[kind] and o.data.font==chip.data.font
    assert abs(o.data.materials[0].node_tree.nodes.get('Emission').inputs['Color'].default_value[0]-.006)<1e-5

def box(ob):
    p=[world_to_camera_view(s,s.camera,ob.matrix_world@Vector(v)) for v in ob.bound_box]
    return [min(v.x for v in p)*width,min(v.y for v in p)*height,max(v.x for v in p)*width,max(v.y for v in p)*height]

def overlap(a,b):
    return min(a[2],b[2])>max(a[0],b[0]) and min(a[3],b[3])>max(a[1],b[1])

def alpha(ob):
    return ob.data.materials[0].node_tree.nodes['White fade'].inputs[0].default_value

errors=[]
label_bounds=[]
fade_samples=[]
for frame in range(1,451):
    s.frame_set(frame)
    bpy.context.view_layer.update()
    shown={kind:box(o) for kind,o in labels.items() if not o.hide_render}
    for kind,b in shown.items():
        if not(40<b[0]<b[2]<width-40 and 100<b[1]<b[3]<height-150):
            errors.append(dict(frame=frame,part=kind,reason='Label outside margins',bounds=b))
        for other,c in shown.items():
            if other>kind and overlap(b,c):
                errors.append(dict(frame=frame,parts=[kind,other],reason='Part labels overlap'))
    if frame in [1,16,34,39,43,45,46]:
        label_bounds.append(dict(frame=frame,labels=shown))
    headers=[o for o in s.objects if o.type=='FONT' and o.data.body in ['01  CHECK THE PARTS','02  CONNECT WI-FI','03  CONNECT LORA','04  JOIN THE BOARDS','ASSEMBLED'] and not o.hide_render]
    assert len(headers)<=1
    if frame in [46,151,256,376]:
        assert not headers
        assert bpy.data.objects['Connector source ring'].hide_render
    if frame in [140,144,147,150,151,152,155,158,161,245,250,255,256,257,260,264,307,310,314,317,364,370,375,376,377,382,385]:
        ob=bpy.data.objects['Circular magnification frame']
        fade_samples.append(dict(frame=frame,callout_opacity=alpha(ob),callout_hidden=ob.hide_render))
    if frame>=46:
        assert all(o.hide_render for o in labels.values())
report=dict(frames_checked=450,opening_names=expected,font_matches_chip_labels=True,
            label_bounds=label_bounds,callout_fade_samples=fade_samples,
            step_titles_never_overlap=True,source_ring_hidden_at_step_changes=True,
            transition_style=s['transition_style'],errors=errors,
            source_blend_sha256=hashlib.sha256((root/'assembly-showcase.blend').read_bytes()).hexdigest())
(root/'transition-validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert not errors,errors
print(json.dumps({k:v for k,v in report.items() if k not in ['label_bounds','callout_fade_samples']},indent=2))
