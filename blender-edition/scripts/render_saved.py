"""Render the saved Blender scenes and package their pages.

blender --background mesh-kit.blend --python scripts/render_saved.py
"""
from pathlib import Path
import sys
import bpy

ROOT = Path(bpy.data.filepath).resolve().parent
sys.path.insert(0,str(ROOT/'scripts'))
from export_outputs import export_outputs

for scene in sorted(bpy.data.scenes,key=lambda s:s['page_number']):
    bpy.context.window.scene = scene
    scene.render.resolution_percentage = 100
    bpy.ops.render.render(write_still=True,scene=scene.name)
export_outputs(ROOT)
