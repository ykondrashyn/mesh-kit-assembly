"""Render reusable PowerPoint assets from the saved native Blender scenes.

blender --background ../blender-edition/mesh-kit.blend --python _source/export_ppt_assets.py
The source blend and its page exports remain untouched.
"""
from pathlib import Path
import hashlib
import json
import math
import shutil

import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT.parent/'blender-edition'
BLEND=SOURCE/'mesh-kit.blend'
ORIGINAL_HASH=hashlib.sha256(BLEND.read_bytes()).hexdigest()
SCENES={s['page_number']:s for s in bpy.data.scenes}
MANIFEST=[]


def diagram(scene,name):
    root=next(o for o in scene.objects if o.get('diagram')==name)
    return [root,*root.children_recursive]


def frame_for(scene,root):
    return next(o for o in scene.objects if o.get('callout_role')=='frame'
                and root.name in json.loads(o['detail_views']))


def paper_disc(scene,frame):
    """The white inside and transparent outside keep a detail visually enclosed."""
    cx,cy,r=json.loads(frame['page_circle'])
    verts=[(cx+r*math.cos(i*math.tau/192),1125-cy+r*math.sin(i*math.tau/192),-2000)
           for i in range(192)]
    mesh=bpy.data.meshes.new('Inset white interior')
    mesh.from_pydata(verts,[],[tuple(range(192))])
    mesh.materials.append(bpy.data.materials['Callout paper halo'])
    ob=bpy.data.objects.new('Inset white interior',mesh)
    scene.collection.objects.link(ob)
    return ob


def bounds(scene,objects):
    bpy.context.window.scene=scene
    bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get()
    low=[float('inf')]*2
    high=[-float('inf')]*2
    for ob in objects:
        if ob.type not in ('MESH','CURVE','FONT'):
            continue
        evaluated=ob.evaluated_get(graph)
        mesh=evaluated.to_mesh()
        for vertex in mesh.vertices:
            p=ob.matrix_world @ vertex.co
            for i in range(2):
                low[i]=min(low[i],p[i])
                high[i]=max(high[i],p[i])
        evaluated.to_mesh_clear()
    return low,high


def render(page,objects,destination,label,kind,long_edge=2400):
    scene=SCENES[page]
    selected=set(objects)
    for ob in scene.objects:
        ob.hide_render=ob.type not in ('LIGHT','CAMERA') and ob not in selected
    low,high=bounds(scene,objects)
    margin=max(high[i]-low[i] for i in range(2))*.025
    size=[high[i]-low[i]+2*margin for i in range(2)]
    pixels=[max(16,round(long_edge*v/max(size))) for v in size]
    scene.camera.location=((low[0]+high[0])/2,(low[1]+high[1])/2,5000)
    scene.camera.data.ortho_scale=max(size)
    scene.render.resolution_x,scene.render.resolution_y=pixels
    scene.render.resolution_percentage=100
    scene.render.film_transparent=True
    scene.render.image_settings.color_mode='RGBA'
    scene.render.image_settings.file_format='PNG'
    scene.render.image_settings.compression=30
    output=ROOT/destination
    scene.render.filepath=str(output)
    print('EXPORT',destination,pixels,flush=True)
    bpy.ops.render.render(write_still=True,scene=scene.name)
    MANIFEST.append({'file':destination,'label':label,'category':kind,
                     'pixels':pixels,'transparent_background':True,
                     'source_page':page,'native_blender_render':True})


for name,filename,label in [
    ('part-xiao','xiao-esp32s3','XIAO ESP32S3'),
    ('part-wio','wio-sx1262','Wio-SX1262'),
    ('part-wifi','wifi-antenna-13','Wi-Fi antenna, 13 plug'),
    ('part-lora','lora-antenna-37-cm','LoRa antenna, 37 / C M plug'),
]:
    render(1,diagram(SCENES[1],name),'01-parts/'+filename+'.png',label,'parts',2000)

for page,name,filename,label in [
    (2,'main-wifi','02-connect-wifi','Connect Wi-Fi'),
    (3,'main-lora','03-connect-lora','Connect LoRa'),
    (4,'main-exploded','04-align-boards','Align the boards'),
    (4,'main-assembled','04-boards-joined','Boards joined'),
]:
    render(page,diagram(SCENES[page],name),'02-assembly/'+filename+'.png',label,'assembly')

for page,name,filename,label in [
    (2,'close-xiao-align','wifi-plug-13-align','Wi-Fi plug, align'),
    (2,'close-xiao-seated','wifi-plug-13-seated','Wi-Fi plug, seated'),
    (3,'close-wio-align','lora-plug-37-cm-align','LoRa plug, align'),
    (3,'close-wio-seated','lora-plug-37-cm-seated','LoRa plug, seated'),
    (4,'close-b2b','board-connector-align','Board connector, align'),
]:
    scene=SCENES[page]
    objects=diagram(scene,name)
    frame=frame_for(scene,objects[0])
    disc=paper_disc(scene,frame)
    render(page,objects+[frame,disc],'03-closeups/'+filename+'.png',label,'closeups',1800)
    bpy.data.objects.remove(disc,do_unlink=True)

# Export the compact complete diagram groups from the combined page.
# Preserve their source rings, unarrowed leaders and circular enlargements.
scene=SCENES[5]
for main,detail,identifier,filename,label in [
    ('main-wifi','close-xiao-align','Wi-Fi plug detail','02-wifi-with-closeup','Wi-Fi with linked close-up'),
    ('main-lora','close-wio-align','LoRa plug detail','03-lora-with-closeup','LoRa with linked close-up'),
    ('main-exploded','close-b2b','Board connector detail','04-boards-with-closeup','Boards with linked close-up'),
]:
    objects=diagram(scene,main)+diagram(scene,detail)
    # Include the matching paper-clearance strokes as well as tagged strokes.
    objects += [o for o in scene.objects if o.get('callout_identifier')==identifier
                or (o.get('annotation')=='magnified_detail' and o.name.startswith(identifier+' /'))]
    frames=[o for o in objects if o.get('callout_role')=='frame']
    discs=[paper_disc(scene,f) for f in frames]
    render(5,objects+discs,'04-linked-panels/'+filename+'.png',label,'linked panels',3200)
    for ob in discs:
        bpy.data.objects.remove(ob,do_unlink=True)

for path in sorted((SOURCE/'output/pages').glob('0[1-5]-*.png')):
    target=ROOT/'05-ready-slides'/path.name
    shutil.copyfile(path,target)
    MANIFEST.append({'file':str(target.relative_to(ROOT)),
                     'label':path.stem,'category':'ready slides','pixels':[3200,1800],
                     'transparent_background':False,'native_blender_render':True})

assert hashlib.sha256(BLEND.read_bytes()).hexdigest()==ORIGINAL_HASH
(ROOT/'_source/manifest.json').write_text(json.dumps({
    'source_blend':'../blender-edition/mesh-kit.blend',
    'source_blend_sha256':ORIGINAL_HASH,'ai_image_generation':False,
    'source_unchanged':True,'assets':MANIFEST},indent=2)+'\n')
print('Exported',len(MANIFEST),'PowerPoint assets to',ROOT,flush=True)
