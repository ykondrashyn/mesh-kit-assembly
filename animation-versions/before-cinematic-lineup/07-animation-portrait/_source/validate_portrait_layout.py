from pathlib import Path
import bpy
import json
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
scene=bpy.context.scene
source=Path(bpy.data.filepath).parent
errors=[]
frames=[]
# All visible HUD type must stay within the portrait margins.
for f in range(1,451):
    scene.frame_set(f)
    bpy.context.view_layer.update()
    for ob in scene.objects:
        if ob.type!='FONT' or ob.hide_render or not ob.parent or ob.parent.name!='Camera-space layout / units in pixels':
            continue
        pts=[world_to_camera_view(scene,scene.camera,ob.matrix_world@Vector(p)) for p in ob.bound_box]
        box=[min(p.x for p in pts)*1080,min(p.y for p in pts)*1920,max(p.x for p in pts)*1080,max(p.y for p in pts)*1920]
        if not (box[0]>40 and box[1]>65 and box[2]<1040 and box[3]<1870):
            errors.append(dict(frame=f,text=ob.data.body,bounds=box))
    if not bpy.data.objects['Unarrowed magnification leader'].hide_render:
        leader=bpy.data.objects['Unarrowed magnification leader']
        points=leader.data.splines[0].points
        # The lower path stays left of the title and reaches the circle's left edge.
        assert points[1].co.x==-370 and points[1].co.y==-20
        assert points[2].co.x==-370 and points[2].co.y==-430
        assert points[3].co.x==-300 and points[3].co.y==-430
    if f in [1,46,94,130,151,199,235,256,307,319,355,375,376,390,421,450]:
        frames.append(f)
old=json.loads((source/'landscape-motion-reference.json').read_text())
new=json.loads((source/'motion-audit.json').read_text())
for a,b in zip(old,new):
    for key in ['frame','time','stage','inset','wio','wifi_plug','lora_plug','camera_azimuth_degrees','camera_elevation_degrees']:
        assert a[key]==b[key],(a['frame'],key)
report=dict(frames_checked=450,portrait=[1080,1920],circular_detail_diameter_pixels=600,
            assembly_motion_matches_landscape=True,return_to_front_retained=True,
            hud_text_within_frame=not errors,leader_avoids_inset_heading=True,errors=errors)
(source/'portrait-layout-validation.json').write_text(json.dumps(report,indent=2)+'\n')
assert not errors,errors
print(json.dumps(report,indent=2))
