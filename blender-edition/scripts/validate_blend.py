#!/usr/bin/env python3
"""Read-only Blender artifact validation, no file mutation or rendering.

Run: blender --background mesh-kit.blend --python scripts/validate_blend.py
Writes research/blend-validation.json. Overlap checks conservatively compare
every projected LoRa film/cable triangle with the projected convex hull of
the complete XIAO board, including the headers and original CAD outlines.
"""
from pathlib import Path
import collections
import hashlib
import json
import math

import bpy

ROOT = Path(__file__).resolve().parents[1]
EPS = 1e-8


def cross(a, b, c):
    return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])


def convex_hull(points):
    points = sorted(set(points))
    lower, upper = [], []
    for p in points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def polygon_area(poly):
    return abs(sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(poly, poly[1:]+poly[:1]))) / 2 if len(poly)>2 else 0


def clip_polygon(poly, hull):
    """Sutherland-Hodgman against a counterclockwise convex hull."""
    for a,b in zip(hull,hull[1:]+hull[:1]):
        if not poly:
            break
        old, poly = poly, []
        for p,q in zip(old,old[1:]+old[:1]):
            cp,cq = cross(a,b,p),cross(a,b,q)
            p_in,q_in = cp>=-EPS,cq>=-EPS
            if p_in:
                poly.append(p)
            if p_in != q_in:
                t = cp/(cp-cq)
                poly.append((p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])))
    return poly


def point_segment_distance(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]
    denominator=dx*dx+dy*dy
    t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/denominator)) if denominator else 0
    return math.hypot(p[0]-(a[0]+t*dx),p[1]-(a[1]+t*dy))


def polygon_distance(a,b):
    if polygon_area(clip_polygon(a,b)) > EPS:
        return 0
    return min([point_segment_distance(p,q,r) for p in a for q,r in zip(b,b[1:]+b[:1])]+
               [point_segment_distance(p,q,r) for p in b for q,r in zip(a,a[1:]+a[:1])])


def evaluated_projection(ob, depsgraph, scene):
    evaluated = ob.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    try:
        mesh.calc_loop_triangles()
        scale = scene.render.resolution_x * scene.render.resolution_percentage / 100 / scene.camera.data.ortho_scale
        transform = scene.camera.matrix_world.inverted() @ ob.matrix_world
        verts = []
        for v in mesh.vertices:
            p = transform @ v.co
            verts.append((p.x*scale,p.y*scale))
        return verts, [tuple(t.vertices) for t in mesh.loop_triangles]
    finally:
        evaluated.to_mesh_clear()


def overlap_check(scene, collection, diagram):
    bpy.context.window.scene = scene
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    board_points = []
    for ob in collection.objects:
        is_surface = ob.type=='MESH' and ob.get('board')=='xiao' and ob.get('category') in ('official_board','supplemental_board')
        is_outline = ob.type=='CURVE' and ob.name.startswith('xiao_')
        if is_surface or is_outline:
            points,_ = evaluated_projection(ob,graph,scene)
            board_points.extend(points)
    hull = convex_hull(board_points)
    results = {}
    for role,prefix in [('film','lora antenna / FPC film'),('cable','lora / coax')]:
        candidates = [o for o in collection.objects if o.name.startswith(prefix) and o.type in ('MESH','CURVE')]
        total_area, clearance, triangle_count = 0., math.inf, 0
        for ob in candidates:
            vertices,triangles = evaluated_projection(ob,graph,scene)
            for indices in triangles:
                poly=[vertices[i] for i in indices]
                area=polygon_area(clip_polygon(poly,hull))
                total_area+=area
                triangle_count+=1
                clearance=min(clearance,polygon_distance(poly,hull))
        results[role] = {'objects':len(candidates),'triangles_checked':triangle_count,
                         'intersection_area_upper_bound_px2':total_area,
                         'minimum_clearance_from_xiao_convex_hull_px':clearance,
                         'no_overlap':bool(candidates) and total_area < 1e-5 and clearance > 1e-4}
    return {'page':scene['page_number'],'diagram':diagram,
            'render_resolution':[int(scene.render.resolution_x*scene.render.resolution_percentage/100),
                                 int(scene.render.resolution_y*scene.render.resolution_percentage/100)],
            'xiao_projected_hull_vertices':len(hull),'xiao_projected_hull_area_px2':polygon_area(hull),
            'method':'Conservative complete XIAO hull versus every evaluated LoRa triangle, including cable bevel and film outline',
            'components':results,'no_lora_overlap_with_xiao':all(v['no_overlap'] for v in results.values())}


def main():
    scenes=sorted(bpy.data.scenes,key=lambda s:s.get('page_number',0))
    report={'blend_path':bpy.data.filepath,'blender_version':bpy.app.version_string,
            'validation_is_read_only':True,'scenes':[],'board_views':[],'overlap_checks':[],
            'magnification_callouts':[],'closeup_views':[]}
    report['blend_sha256']=hashlib.sha256(Path(bpy.data.filepath).read_bytes()).hexdigest()
    for scene in scenes:
        bpy.context.window.scene=scene
        bpy.context.view_layer.update()
        graph=bpy.context.evaluated_depsgraph_get()
        page=scene.get('page_number')
        diagrams=[]
        for group in scene.collection.children:
            roots=[o for o in group.objects if o.type=='EMPTY' and o.get('diagram')]
            if not roots:
                continue
            diagram=roots[0]['diagram']
            diagrams.append(diagram)
            if diagram.startswith('close-'):
                circle=json.loads(roots[0]['fit_circle'])
                cx,cy,radius=circle
                maximum_radius=0
                for ob in group.objects:
                    if ob.type not in ('MESH','CURVE','FONT'):
                        continue
                    evaluated=ob.evaluated_get(graph)
                    mesh=evaluated.to_mesh()
                    for vertex in mesh.vertices:
                        world=ob.matrix_world @ vertex.co
                        maximum_radius=max(maximum_radius,math.hypot(world.x-cx,world.y-(1125-cy)))
                    evaluated.to_mesh_clear()
                report['closeup_views'].append({'page':page,'diagram':diagram,
                                                'linked_callout':roots[0].get('magnification_callout'),
                                                'circle':circle,'maximum_geometry_radius':maximum_radius,
                                                'clearance':radius-maximum_radius,
                                                'all_geometry_inside_circle':maximum_radius<radius-10})
            counts=collections.Counter(o.get('board') for o in group.objects if o.type=='MESH' and o.get('category')=='official_board')
            for board,count in counts.items():
                expected={'xiao':37,'wio':9}[board]
                report['board_views'].append({'page':page,'diagram':diagram,'board':board,
                                              'official_solids':count,'expected':expected,'complete':count==expected})
            if page in (4,5) and diagram in ('main-exploded','main-assembled'):
                report['overlap_checks'].append(overlap_check(scene,group,diagram))
        report['scenes'].append({'page':page,'name':scene.name,'camera_type':scene.camera.data.type,
                                 'objects':len(scene.objects),'diagrams':diagrams,
                                 'editable_text_objects':sum(o.type=='FONT' for o in scene.objects)})
        identifiers=sorted({o['callout_identifier'] for o in scene.objects if o.get('callout_role')=='frame'})
        for identifier in identifiers:
            parts=[o for o in scene.objects if o.get('callout_identifier')==identifier]
            roles=collections.Counter(o.get('callout_role') for o in parts)
            leaders=[o for o in parts if o.get('callout_role')=='leader']
            frames=[o for o in parts if o.get('callout_role')=='frame']
            detail_names=[name for frame in frames for name in json.loads(frame['detail_views'])]
            frames_are_circles=True
            for frame in frames:
                cx,cy,r=json.loads(frame['page_circle'])
                for spline in frame.data.splines:
                    for point in spline.points:
                        p=frame.matrix_world @ point.co.to_3d()
                        if abs(math.hypot(p.x-cx,p.y-(1125-cy))-r)>.001:
                            frames_are_circles=False
            report['magnification_callouts'].append({
                'page':page,'identifier':identifier,'details':detail_names,
                'has_source_ring_frame_and_leader':roles['source_ring']==1 and roles['frame']==roles['leader']==len(detail_names),
                'frame_count':len(frames),'frames_are_true_circles':frames_are_circles,
                'source_exists_in_same_scene':all(o.get('source_view') in scene.objects for o in parts if o.get('source_view')),
                'details_exist_in_same_scene':all(n in scene.objects for n in detail_names),
                'leader_is_not_a_motion_arrow':all(not o.get('arrowhead',True) for o in leaders),
            })
    fonts=[{'name':f.name,'filepath':f.filepath,'packed':bool(f.packed_file),'users':f.users} for f in bpy.data.fonts]
    images=[{'name':i.name,'source':i.source,'filepath':i.filepath,'users':i.users} for i in bpy.data.images]
    raster_nodes=[]
    for datablocks in (bpy.data.materials,bpy.data.worlds,bpy.data.scenes):
        for item in datablocks:
            nt=getattr(item,'node_tree',None)
            if nt:
                raster_nodes.extend({'owner':item.name,'node':n.name,'type':n.bl_idname} for n in nt.nodes
                                    if n.bl_idname in ('ShaderNodeTexImage','ShaderNodeTexEnvironment','CompositorNodeImage'))
    report['fonts']=fonts
    report['images']=images
    report['raster_input_nodes']=raster_nodes
    plugs=[o for o in bpy.data.objects if o.type=='MESH' and o.get('category')=='manufacturer_rf_plug' and o.users_collection]
    expected_triangles={kind:json.loads((ROOT/'meshes'/filename).read_text())['object']['statistics']['triangles']
                        for kind,filename in [('wifi','rf-plug-manifest.json'),('lora','rf-plug-137-manifest.json')]}
    stamps=[o for o in bpy.data.objects if o.get('category')=='observed_connector_marking' and o.users_collection]
    def correct_variant(ob):
        kind=ob.get('antenna_kind')
        if kind not in expected_triangles or len(ob.data.polygons)!=expected_triangles[kind]:
            return False
        diagram=ob.parent.get('diagram','')
        if diagram in ('main-exploded','main-assembled'):
            return True
        expected='wifi' if diagram in ('part-wifi','main-wifi') or diagram.startswith('close-xiao') else 'lora'
        return kind==expected
    lora_parents=collections.Counter(o.parent.name for o in plugs if o.get('antenna_kind')=='lora')
    stamp_parents=collections.Counter(o.parent.name for o in stamps if o.type=='FONT' and o.data.body=='C M')
    report['rf_plugs']={'instances':len(plugs),'shared_mesh_names':sorted({o.data.name for o in plugs}),
                        'triangle_counts':sorted({len(o.data.polygons) for o in plugs}),
                        'instances_by_antenna':dict(collections.Counter(o.get('antenna_kind') for o in plugs)),
                        'observed_cm_stamps':len(stamps),
                        'provenance':'Two complete I-PEX MHF I reference meshes. 1.13 mm / 13 for Wi-Fi, 1.37 mm / 37 for LoRa. Separate C M artwork follows user observation, meaning unverified.'}
    overview=next(s for s in report['scenes'] if s['page']==5)
    report['checks']={
        'five_native_scenes':[s.get('page_number') for s in scenes]==[1,2,3,4,5],
        'all_orthographic':all(s.camera and s.camera.data.type=='ORTHO' for s in scenes),
        'all_font_files_packed':all(f['packed'] or f['filepath']=='<builtin>' for f in fonts if f['users']),
        'no_raster_inputs':not raster_nodes and not [i for i in images if i['source']!='VIEWER'],
        'all_official_board_views_complete':bool(report['board_views']) and all(v['complete'] for v in report['board_views']),
        'combined_page_has_all_three_closeups':all(n in overview['diagrams'] for n in ('close-xiao-align','close-wio-align','close-b2b')),
        'lora_does_not_overlap_xiao_in_step4':len(report['overlap_checks'])==3 and all(c['no_lora_overlap_with_xiao'] for c in report['overlap_checks']),
        'all_rf_plugs_use_correct_complete_manufacturer_variant':len(plugs)>0 and len({o.data.as_pointer() for o in plugs})==2 and all(correct_variant(o) for o in plugs),
        'every_lora_plug_has_observed_cm_stamp':bool(lora_parents) and lora_parents==stamp_parents,
        'every_closeup_has_a_magnification_callout':len(report['closeup_views'])==8 and all(v['linked_callout'] for v in report['closeup_views']),
        'all_eight_insets_are_true_circles':sum(c['frame_count'] for c in report['magnification_callouts'])==8 and all(c['frames_are_true_circles'] for c in report['magnification_callouts']),
        'all_closeup_geometry_fits_inside_circles':all(c['all_geometry_inside_circle'] for c in report['closeup_views']),
        'six_complete_linked_callouts':len(report['magnification_callouts'])==6 and all(
            all(c[k] for k in ('has_source_ring_frame_and_leader','source_exists_in_same_scene',
                               'details_exist_in_same_scene','leader_is_not_a_motion_arrow'))
            for c in report['magnification_callouts']),
    }
    report['passed']=all(report['checks'].values())
    out=ROOT/'research/blend-validation.json'
    out.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print('VALIDATION',json.dumps(report['checks']),flush=True)
    for check in report['overlap_checks']:
        print('OVERLAP',json.dumps(check),flush=True)
    print('Validation report',out,flush=True)
    if not report['passed']:
        raise RuntimeError('Artifact validation failed, inspect research/blend-validation.json')


if __name__=='__main__':
    main()
