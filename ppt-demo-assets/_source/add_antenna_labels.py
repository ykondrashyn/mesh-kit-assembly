"""Add native frequency labels to every antenna film in the loaded guide."""
import math
import bpy
from mathutils import Matrix


def add_antenna_labels():
    chip=next(ob for ob in bpy.data.objects if ob.type=='FONT' and ob.data.body=='ESP32-S3')
    font=chip.data.font
    ink=chip.data.materials[0]
    counts={'wifi':0,'lora':0}
    for film in list(bpy.data.objects):
        if film.type!='MESH' or 'antenna / FPC film' not in film.name:
            continue
        kind='wifi' if film.name.startswith('wifi') else 'lora'
        points=[v.co for v in film.data.vertices]
        low=[min(v[i] for v in points) for i in range(3)]
        high=[max(v[i] for v in points) for i in range(3)]
        w,l=high[0]-low[0],high[1]-low[1]
        data=bpy.data.curves.new('Antenna identification','FONT')
        data.body='Wi-Fi\n2.4 GHz' if kind=='wifi' else 'LoRa\n868 MHz'
        data.font=font
        data.size=2.8 if kind=='wifi' else 2.6
        data.align_x='CENTER'
        data.align_y='CENTER'
        data.space_line=.9
        data.resolution_u=8
        data.materials.append(ink)
        label=bpy.data.objects.new('Printed antenna label / '+kind,data)
        label.parent=film.parent
        position=(low[0]+w/2,low[1]+l*(.72 if kind=='wifi' else .57),high[2]+.04)
        label.matrix_basis=film.matrix_basis@Matrix.Translation(position)@Matrix.Rotation(math.pi/2,4,'Z')
        label['antenna_kind']=kind
        label['frequency_label']='2.4 GHz' if kind=='wifi' else '868 MHz'
        label['provenance']='User-requested instructional antenna label'
        for collection in film.users_collection:
            collection.objects.link(label)
        counts[kind]+=1
    assert counts['wifi'] and counts['lora'],counts
    return counts
