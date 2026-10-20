#!/usr/bin/env python3
"""Export the original I-PEX MHF I 20278 plug STEP for Blender.

The complete manufacturer solid is preserved, including its straight cable
stub. The plug remains a representative matching-family component, not a
verified identification of the exact plug supplier used in the Seeed kit.
Requires cadquery-ocp and this directory's export_step_meshes.py.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
from pathlib import Path

from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Surface
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.GeomAbs import GeomAbs_Cylinder, GeomAbs_Plane
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.TopoDS import TopoDS

import export_step_meshes as cad

ROOT=Path(__file__).resolve().parents[1]
SOURCE_DIR=ROOT/'source-models/rf-plug'
PLUG='20278-1xxR-13C PLUG R15 STEP ALL.STEP'
COMBINED='20278-1xxR-13+20279-001E-xxC R15R9 STEP ALL.STEP'
RECEPTACLE='20279-001E-xxC RECEPTACLE R9 STEP ALL.STEP'
ZIP_URL='https://www.i-pex.com/sites/default/files/downloads/zip/MHF_I_20278_113_20279_STEP.zip'
PRODUCT_URL='https://www.i-pex.com/product/mhf-I'
# Verified by matching source cup cylinders and cable centerlines against the
# supplied combined STEP: combined(X,Y,Z) = (plug.Z, plug.Y+2.1, -plug.X).
# The normalized scene uses cable +Y and upward Z, PCB plane Z=0.
TRANSFORM=[0,0,1,0, 1,0,0,0, 0,1,0,2.1]


def jacket_surface(face):
    """Tag the actual cable cylinder and its original caps for dark styling."""
    surface=BRepAdaptor_Surface(face)
    b=cad.bounds(face)
    low,high=b['min'],b['max']
    if surface.GetType()==GeomAbs_Cylinder:
        cylinder=surface.Cylinder()
        return (abs(cylinder.Radius()-.56501)<1e-6 and
                abs(abs(cylinder.Axis().Direction().Y())-1)<1e-5 and
                low[1]>3.999 and high[1]>6.999)
    if surface.GetType()==GeomAbs_Plane:
        at_end=abs(low[1]-7)<1e-4 and abs(high[1]-7)<1e-4
        original_exposed_base=(abs(low[1]-4)<1e-4 and abs(high[1]-4)<1e-4 and
                               high[2]<1.324 and low[2]<1.071)
        return at_end or original_exposed_base
    return False


def tessellate_materials(shape,deflection,angle):
    BRepMesh_IncrementalMesh(shape,deflection,False,angle,True)
    iterator=TopExp_Explorer(shape,TopAbs_FACE)
    vertices,faces,ids,seen=[],[],{},set()
    materials,source_faces=[],[]
    seams=TopTools_IndexedMapOfShape()
    index=0
    dark_faces=[]
    while iterator.More():
        face=TopoDS.Face_s(iterator.Current())
        loc=TopLoc_Location()
        mesh=BRep_Tool.Triangulation_s(face,loc)
        if mesh is None:
            raise RuntimeError(f'Missing triangulation on original plug face {index}')
        tag=1 if jacket_surface(face) else 0
        if tag:
            dark_faces.append(index)
        nodes=[cad.point(mesh.Node(i).Transformed(loc.Transformation())) for i in range(1,mesh.NbNodes()+1)]
        for i in range(1,mesh.NbTriangles()+1):
            indices=list(mesh.Triangle(i).Get())
            if face.Orientation()==TopAbs_REVERSED:
                indices.reverse()
            pts=[nodes[j-1] for j in indices]
            key=tuple(sorted(pts))
            if key in seen or cad.cross_area_squared(*pts)<1e-18:
                continue
            seen.add(key)
            tri=[]
            for point in pts:
                if point not in ids:
                    ids[point]=len(vertices)
                    vertices.append(point)
                tri.append(ids[point])
            faces.append(tri)
            materials.append(tag)
            source_faces.append(index)
        edges=TopExp_Explorer(face,TopAbs_EDGE)
        while edges.More():
            edge=TopoDS.Edge_s(edges.Current())
            if BRep_Tool.IsClosed_s(edge,face):
                seams.Add(edge)
            edges.Next()
        iterator.Next()
        index+=1
    edges,edge_stats=cad.feature_edges(shape,seams,deflection/2)
    return {'vertices':vertices,'faces':faces,'edges':edges,'bounds':cad.bounds(shape),
            'material_names':['gold','cable'],'face_materials':materials,'source_face_indices':source_faces,
            'statistics':{'cad_faces':index,'vertices':len(vertices),'triangles':len(faces),
                          'feature_segments':len(edges),'cable_styling_source_faces':dark_faces,**edge_stats}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deflection',type=float,default=.004)
    parser.add_argument('--angle',type=float,default=.15)
    parser.add_argument('--output',type=Path,default=ROOT/'meshes/rf-plug.json.gz')
    args=parser.parse_args()
    source=SOURCE_DIR/PLUG
    solids=cad.load_step(source,TRANSFORM)
    if len(solids)!=1:
        raise RuntimeError('The original plug STEP must contain exactly one complete solid')
    mesh=tessellate_materials(solids[0],args.deflection,args.angle)
    if mesh['statistics']['cad_faces']!=378:
        raise RuntimeError('The original plug CAD face count changed')
    if mesh['statistics']['cable_styling_source_faces']!=[3,346,347,348]:
        raise RuntimeError('Cable jacket surface classification changed')
    metadata={
        'schema_version':1,'units':'mm','manufacturer':'I-PEX','family':'MHF I',
        'model':'20278-1xxR-13C PLUG R15','product_page':PRODUCT_URL,'download_url':ZIP_URL,
        'source_path':'source-models/rf-plug/'+PLUG,'source_sha256':cad.sha256(source),
        'reference_files':{name:{'path':'source-models/rf-plug/'+name,'sha256':cad.sha256(SOURCE_DIR/name)}
                           for name in (COMBINED,RECEPTACLE)},
        'source_to_normalized_mm_3x4':TRANSFORM,
        'axes':'Mating axis +Z, opening faces down, cable extends +Y, origin is the mated reference PCB surface at the connector axis',
        'mated_reference':{
            'basis':'Matching exact outer cup cylinders and cable centerline to the supplied combined plug/receptacle STEP',
            'combined_source_xyz_from_plug_source_xyz':'[plug.Z, plug.Y+2.1, -plug.X]',
            'pcb_plane_z_mm':0.0,'receptacle_top_z_mm':1.25,
            'plug_bottom_z_mm':.30,'plug_top_z_mm':2.40,
            'place_for_socket_top_z':'Translate normalized plug Z by socket_top_z - 1.25',
            'xiao_seated_board_translation_mm':[13.6167,19.2334,1.25],
            'wio_seated_board_translation_mm':[5.3984,19.4793,1.65],
        },
        'cable_join':{'centerline_start_mm':[0,4,1.635],'centerline_end_mm':[0,7,1.635],
                      'native_curve_start_mm':[0,7,1.635],'native_curve_tangent':[0,1,0],
                      'radius_mm':.56501,'nominal_radius_mm':.565,'diameter_mm':1.13002,
                      'geometry_removed':False,'trim_boundary':None,
                      'note':'Preserve the complete original straight stub. Continue its circular end with a native Bezier cable.'},
        'materials':'Original AP203 file has no color metadata. The four exact jacket faces are styled dark. Metallic surfaces use the gold finish visible in the Seeed reference photo.',
        'geometry_policy':'All 378 original faces and the entire single solid retained. No Boolean cuts, clipping, deformation or replacement geometry.',
        'mesh_chordal_deflection_mm':args.deflection,'mesh_angle_rad':args.angle,
        'limitations':[
            'Representative manufacturer model for the matching MHF I family. The exact supplier and revision of the kit antenna plug were not verified.',
            'The model is a single fused solid. Fine internal surfaces are preserved, but material identities are not encoded by the source.',
            'Mating offsets derive from the I-PEX reference pair. Actual fit with the Seeed receptacle is not mechanically validated.',
        ],
    }
    obj={'name':'ipex_mhf_i_20278_official_plug','category':'rf_plug','kind':'rf_plug','role':'rf_plug',
         'board':None,'solid_index':0,'material':'gold','schematic':False,
         'source':{'path':metadata['source_path'],'sha256':metadata['source_sha256'],'url':ZIP_URL},**mesh}
    data={'metadata':metadata,'objects':[obj]}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    with args.output.open('wb') as out:
        with gzip.GzipFile(filename='',mode='wb',fileobj=out,mtime=0) as encoded:
            encoded.write(json.dumps(data,separators=(',',':'),allow_nan=False).encode())
    manifest={'metadata':metadata,'library':args.output.name,'sha256':cad.sha256(args.output),
              'object':{k:v for k,v in obj.items() if k not in ('vertices','faces','edges','face_materials','source_face_indices')}}
    (args.output.parent/'rf-plug-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(mesh['statistics']),flush=True)
    print('Plug bounds',mesh['bounds'],flush=True)
    print('Native cable join',metadata['cable_join'],flush=True)
    print('Wrote',args.output,flush=True)


if __name__=='__main__':
    main()
