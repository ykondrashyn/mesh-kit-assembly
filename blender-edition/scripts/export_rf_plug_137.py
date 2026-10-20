#!/usr/bin/env python3
"""Preserve the complete official 1.37 mm MHF I plug as a separate library."""
import gzip
import json
from pathlib import Path

from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane

import export_step_meshes as cad
import export_rf_plug as exporter

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'source-models/rf-plug-137/20351-1xxR-37C PLUG R7 STEP ALL.STEP'
URL='https://www.i-pex.com/sites/default/files/downloads/zip/MHF_I_20351_137_20279_STEP.zip'


def jacket_surface(face):
    surface=BRepAdaptor_Surface(face)
    low,high=(cad.bounds(face)[key] for key in ('min','max'))
    if surface.GetType()==GeomAbs_Cylinder:
        cylinder=surface.Cylinder()
        return (abs(cylinder.Radius()-.685015)<1e-6 and
                abs(abs(cylinder.Axis().Direction().Y())-1)<1e-5 and
                low[1]>4.699 and high[1]>7.699)
    if surface.GetType()==GeomAbs_Plane:
        end=abs(low[1]-7.7)<1e-4 and abs(high[1]-7.7)<1e-4
        base=(abs(low[1]-4.7)<1e-4 and abs(high[1]-4.7)<1e-4 and
              high[2]<1.338 and low[2]<.831)
        return end or base
    return False


def main():
    exporter.jacket_surface=jacket_surface
    solids=cad.load_step(SOURCE,exporter.TRANSFORM)
    assert len(solids)==1
    mesh=exporter.tessellate_materials(solids[0],.004,.15)
    assert mesh['statistics']['cad_faces']==374
    assert mesh['statistics']['cable_styling_source_faces']==[0,331,372,373]
    metadata={
        'schema_version':1,'units':'mm','manufacturer':'I-PEX','family':'MHF I',
        'model':'20351-1xxR-37C PLUG R7','product_page':exporter.PRODUCT_URL,
        'download_url':URL,'source_path':str(SOURCE.relative_to(ROOT)),
        'source_sha256':cad.sha256(SOURCE),
        'reference_files':{p.name:{'path':str(p.relative_to(ROOT)),'sha256':cad.sha256(p)}
                           for p in SOURCE.parent.glob('*.STEP') if p!=SOURCE},
        'source_to_normalized_mm_3x4':exporter.TRANSFORM,
        'axes':'Mating axis +Z, opening down, cable +Y, reference PCB surface Z=0',
        'mated_reference':{
            'basis':'Matching cup cylinders and cable centerline against supplied mated STEP',
            'combined_source_xyz_from_plug_source_xyz':'[plug.Z, plug.Y+2.1, -plug.X]',
            'pcb_plane_z_mm':0,'receptacle_top_z_mm':1.25,
            'plug_bottom_z_mm':.30,'plug_top_z_mm':2.40,
            'place_for_socket_top_z':'Translate normalized plug Z by socket_top_z - 1.25',
        },
        'cable_join':{'centerline_start_mm':[0,4.7,1.515],
                      'centerline_end_mm':[0,7.7,1.515],
                      'native_curve_start_mm':[0,7.7,1.515],
                      'native_curve_tangent':[0,1,0],'radius_mm':.685015,
                      'nominal_radius_mm':.685,'diameter_mm':1.37003,
                      'geometry_removed':False},
        'geometry_policy':'All 374 source faces retained. Blender may add a separately tagged marking surface to reproduce the user-observed 37 / C M stamp.',
        'mesh_chordal_deflection_mm':.004,'mesh_angle_rad':.15,
        'limitations':[
            'Representative 1.37 mm MHF I geometry. Exact supplier of the kit plug is unverified.',
            'The C M stamp is user-observed. Its meaning and manufacturer are unverified.',
            'Source geometry is preserved. Any added stamp artwork is illustrative.',
            'Fit with the Seeed board receptacle has not been mechanically tested.',
        ],
    }
    obj={'name':'ipex_mhf_i_20351_official_plug','category':'rf_plug','kind':'rf_plug',
         'role':'rf_plug','board':None,'solid_index':0,'material':'gold','schematic':False,
         'source':{'path':metadata['source_path'],'sha256':metadata['source_sha256'],'url':URL},**mesh}
    output=ROOT/'meshes/rf-plug-137.json.gz'
    with output.open('wb') as out:
        with gzip.GzipFile(filename='',mode='wb',fileobj=out,mtime=0) as encoded:
            encoded.write(json.dumps({'metadata':metadata,'objects':[obj]},separators=(',',':')).encode())
    manifest={'metadata':metadata,'library':output.name,'sha256':cad.sha256(output),
              'object':{k:v for k,v in obj.items() if k not in ('vertices','faces','edges','face_materials','source_face_indices')}}
    (ROOT/'meshes/rf-plug-137-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(mesh['statistics']))
    print('Wrote',output)


if __name__=='__main__':
    main()
