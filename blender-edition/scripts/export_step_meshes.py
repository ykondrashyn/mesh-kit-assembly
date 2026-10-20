#!/usr/bin/env python3
"""Tessellate manufacturer STEP files for a fully native Blender manual.

Requires cadquery-ocp. This script has no LDraw or LPub3D dependency.
The result is JSON with mesh triangles and original CAD feature polylines.
All coordinates are normalized millimeters, X across board, Y toward the
antenna edge, Z upward. All official solids are retained unchanged.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path

from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.GCPnts import GCPnts_QuasiUniformDeflection
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED, TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.TopoDS import TopoDS
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf, gp_Vec

ROOT = Path(__file__).resolve().parents[1]
TRANSFORMS = {
    "xiao": [0, 0, -1, 2.7786, -1, 0, 0, 12.2817, 0, 1, 0, .25],
    "wio": [-1, 0, 0, 123.2916, 0, -1, 0, -110.3625, 0, 0, 1, 0],
}
SOURCE_FILES = {
    "xiao": "xiao-esp32s3-model/XIAO-ESP32S3 v2.step",
    "wio": "wio-sx1262-for-xiao.step",
}
SOURCE_URLS = {
    "xiao": "https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip",
    "wio": "https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step",
}
LANDMARKS = {
    "xiao": {"rf": [13.617, 19.233, 2.5], "b2b": [6.7307, 19.4056, 2.2],
             "usb": [8.89, -1.527, 2.36], "shield_center": [8.89, 12.01, 3.25]},
    "wio": {"rf": [5.3984, 19.4793, 2.9], "b2b": [6.731, 19.406, -3.5],
            "button": [8.89, 8.07, 2.6], "shield_center": [8.89, 15.4, 3.8]},
}
DETAILS = [
    {"name": "detail_xiao_rf", "detail_key": "xiao-rf", "board": "xiao", "solid_index": 35, "role": "rf_socket",
     "origin": [13.61668, 19.23344, 1.25], "material": "gold",
     "bounds_expected": [12.0, 17.65, 1.20, 15.22, 20.80, 2.55],
     "mating_plane_local_z_mm": 1.25, "source_component": "U.FL-R-SMT-1_10_ v1:1"},
    {"name": "detail_wio_rf", "detail_key": "wio-rf", "board": "wio", "solid_index": 5, "role": "rf_socket",
     "origin": [5.3984, 19.47932, 1.60], "material": "gold",
     "bounds_expected": [3.85, 17.88, 1.59, 6.95, 21.08, 2.95],
     "mating_plane_local_z_mm": 1.30, "source_component": "RF socket solid within Wio-SX1262 module"},
    {"name": "detail_wio_b2b", "detail_key": "wio-b2b", "board": "wio", "solid_index": 7, "role": "b2b_connector",
     "origin": [6.731, 19.4056, 0.0], "material": "dark",
     "bounds_expected": [2.38, 17.63, -3.55, 11.08, 21.18, -.05],
     "mating_tip_local_z_mm": -3.5, "source_component": "J3 BF04-30pin-35H"},
]


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounds(shape):
    bound = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, bound, False, False)
    values = list(bound.Get())
    return {"min": values[:3], "max": values[3:]}


def load_step(path, transform):
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise RuntimeError(f"Unable to read STEP: {path}")
    if not reader.TransferRoots():
        raise RuntimeError(f"No STEP roots transferred: {path}")
    tr = gp_Trsf()
    tr.SetValues(*transform)
    shape = BRepBuilderAPI_Transform(reader.OneShape(), tr, True).Shape()
    it = TopExp_Explorer(shape, TopAbs_SOLID)
    solids = []
    while it.More():
        solids.append(it.Current())
        it.Next()
    return solids


def point(p):
    return tuple(0.0 if abs(v) < .0000005 else round(v, 6) for v in p.Coord())


def cross_area_squared(a, b, c):
    u, v = [b[i] - a[i] for i in range(3)], [c[i] - a[i] for i in range(3)]
    w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    return sum(k * k for k in w)


def tessellate(shape, deflection=.025, angle=.25):
    BRepMesh_IncrementalMesh(shape, deflection, False, angle, True)
    faces = TopExp_Explorer(shape, TopAbs_FACE)
    vertices, triangles, vertex_ids, seen = [], [], {}, set()
    seam_edges = TopTools_IndexedMapOfShape()
    face_count = 0
    while faces.More():
        face = TopoDS.Face_s(faces.Current())
        loc = TopLoc_Location()
        mesh = BRep_Tool.Triangulation_s(face, loc)
        if mesh is None:
            raise RuntimeError(f"CAD face {face_count} has no triangulation")
        nodes = [point(mesh.Node(i).Transformed(loc.Transformation())) for i in range(1, mesh.NbNodes() + 1)]
        for i in range(1, mesh.NbTriangles() + 1):
            ids = list(mesh.Triangle(i).Get())
            if face.Orientation() == TopAbs_REVERSED:
                ids.reverse()
            pts = [nodes[j - 1] for j in ids]
            key = tuple(sorted(pts))
            if key in seen or cross_area_squared(*pts) < 1e-18:
                continue
            seen.add(key)
            triangle = []
            for p in pts:
                if p not in vertex_ids:
                    vertex_ids[p] = len(vertices)
                    vertices.append(p)
                triangle.append(vertex_ids[p])
            triangles.append(triangle)
        edges = TopExp_Explorer(face, TopAbs_EDGE)
        while edges.More():
            edge = TopoDS.Edge_s(edges.Current())
            if BRep_Tool.IsClosed_s(edge, face):
                seam_edges.Add(edge)
            edges.Next()
        faces.Next()
        face_count += 1
    edges, edge_stats = feature_edges(shape, seam_edges, deflection / 2)
    if not vertices or not triangles:
        raise RuntimeError("Empty CAD mesh")
    return {"vertices": vertices, "faces": triangles, "edges": edges, "bounds": bounds(shape),
            "statistics": {"cad_faces": face_count, "vertices": len(vertices), "triangles": len(triangles),
                           "feature_segments": len(edges), **edge_stats}}


def feature_edges(shape, seams, deflection):
    """Sample original BRep edges, omitting periodic seams and duplicates."""
    iterator = TopExp_Explorer(shape, TopAbs_EDGE)
    segments, seen, edges_seen = [], set(), TopTools_IndexedMapOfShape()
    suppressed = 0
    while iterator.More():
        edge = TopoDS.Edge_s(iterator.Current())
        iterator.Next()
        if edges_seen.Contains(edge):
            continue
        edges_seen.Add(edge)
        if BRep_Tool.Degenerated_s(edge) or seams.Contains(edge):
            suppressed += 1
            continue
        sample = GCPnts_QuasiUniformDeflection(BRepAdaptor_Curve(edge), deflection)
        if not sample.IsDone():
            raise RuntimeError("Failed to sample an original CAD feature edge")
        pts = [point(sample.Value(i)) for i in range(1, sample.NbPoints() + 1)]
        for a, b in zip(pts, pts[1:]):
            key = tuple(sorted((a, b)))
            if a != b and key not in seen:
                segments.append((a, b))
                seen.add(key)
    return segments, {"unique_brep_edges": edges_seen.Extent(), "suppressed_periodic_or_degenerate_edges": suppressed}


def box(x, y, z, dx, dy, dz):
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def supplements():
    """Kit additions omitted from official STEP, deliberately separate."""
    socket = BRepAlgoAPI_Cut(box(2.4307, 17.6884, 1.25, 8.6, 3.4344, .95),
                            box(3.05, 18.24, 1.50, 7.35, 2.3, .85)).Shape()
    yield "xiao_socket_schematic", "xiao", "b2b_socket", "dark", socket
    for row, x in enumerate((1.27, 16.51)):
        yield f"xiao_header_{row}_spacer", "xiao", "header_spacer", "dark", box(x - 1.22, 1.651, -2.2, 2.44, 17.78, 2.2)
        for i in range(7):
            yield f"xiao_header_{row}_pin_{i}", "xiao", "header_pin", "gold", box(x - .32, 2.921 + 2.54 * i - .32, -6.2, .64, .64, 6.3)
    yield "wio_button_base", "wio", "button_base", "metal", box(7.00, 6.72, 1.60, 3.78, 2.70, .55)
    yield "wio_button_cap", "wio", "button_cap", "dark", BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(8.89, 8.07, 2.15), gp_Dir(0, 0, 1)), .93, .45).Shape()


def material_role(board, index):
    """Simple diagram styling by verified geometry, not exact factory colors."""
    if board == "xiao":
        if index == 36:
            return "pcb", "pcb"
        if index == 24:
            return "metal", "shield"
        if index == 35:
            return "gold", "rf_socket"
        if index == 18:
            return "metal", "usb_shell"
        if index in (10, 22):
            return "dark", "usb_insert"
        if index in (25, 30):
            return "dark", "button_body"
        return "gold" if index < 24 else "metal", "contact"
    return {
        0: ("dark", "resistor"), 1: ("dark", "resistor"), 2: ("dark", "resistor"),
        3: ("ceramic", "led"), 4: ("pcb", "module_pcb"), 5: ("gold", "rf_socket"),
        6: ("metal", "shield"), 7: ("dark", "b2b_connector"), 8: ("pcb", "pcb"),
    }[index]


def translate(shape, origin):
    transform = gp_Trsf()
    transform.SetTranslation(gp_Vec(*[-v for v in origin]))
    return BRepBuilderAPI_Transform(shape, transform, True).Shape()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sources", type=Path, default=ROOT / "source-models")
    parser.add_argument("--output", type=Path, default=ROOT / "meshes")
    parser.add_argument("--deflection", type=float, default=.025)
    parser.add_argument("--detail-deflection", type=float, default=.008)
    args = parser.parse_args()
    if min(args.deflection, args.detail_deflection) <= 0:
        parser.error("Mesh tolerances must be positive")
    args.output.mkdir(parents=True, exist_ok=True)
    sources = {b: {"path": "source-models/" + SOURCE_FILES[b], "sha256": sha256(args.sources / SOURCE_FILES[b]),
                   "url": SOURCE_URLS[b], "source_to_normalized_mm_3x4": TRANSFORMS[b]} for b in SOURCE_FILES}
    metadata = {
        "schema_version": 1, "units": "mm", "axes": "X across board, Y from USB end toward antenna edge, Z upward",
        "coordinate_system": "Right handed normalized manufacturer geometry",
        "sources": sources, "landmarks_normalized_mm": LANDMARKS,
        "feature_edges": "Original BRep curves sampled as segments, periodic seams and duplicates removed, no triangle edges",
        "material_tags": "Simplified diagram styling from component geometry, not manufacturer color replication",
        "official_solids_expected": {"xiao": 37, "wio": 9},
        "mesh_chordal_deflection_mm": args.deflection, "detail_chordal_deflection_mm": args.detail_deflection,
        "mesh_angle_rad": .25, "detail_angle_rad": .20,
        "limitations": [
            "XIAO mating socket, side headers and Wio pushbutton are schematic kit additions omitted from the supplied STEP models.",
            "The XIAO socket omits contacts, so the nominal board spacing is illustrative rather than a verified mechanical fit.",
            "Material tags apply uniformly to solids that can contain both plastic and metal surfaces.",
        ],
        "b2b_composition": {"xiao_origin_local_mm": [0, 0, 0], "wio_nominal_mating_origin_local_mm": [0, 0, 3.75],
                            "suggested_exploded_wio_origin_local_mm": [0, 0, 8], "rotations": "None"},
    }
    objects, solids = [], {}
    for board in ("xiao", "wio"):
        solids[board] = load_step(args.sources / SOURCE_FILES[board], TRANSFORMS[board])
        if len(solids[board]) != metadata["official_solids_expected"][board]:
            raise RuntimeError(f"Unexpected official solid count for {board}")
        for index, shape in enumerate(solids[board]):
            material, role = material_role(board, index)
            name = f"{board}_official_{index:03d}_{role}"
            obj = {"name": name, "board": board, "kind": "official_board", "source": sources[board],
                   "solid_index": index, "role": role, "material": material, "schematic": False,
                   **tessellate(shape, args.deflection)}
            objects.append(obj)
        print(f"Exported all {len(solids[board])} official {board} solids", flush=True)
    additions = {}
    for name, board, role, material, shape in supplements():
        additions[name] = shape
        objects.append({"name": name, "board": board, "kind": "supplemental_board", "role": role,
                        "source": {"path": "scripts/export_step_meshes.py", "description": "Procedural kit illustration"},
                        "material": material, "schematic": True, **tessellate(shape, args.deflection)})
    for spec in DETAILS:
        board, index = spec["board"], spec["solid_index"]
        shape = solids[board][index]
        b, region = bounds(shape), spec["bounds_expected"]
        if not all(b["min"][i] >= region[i] and b["max"][i] <= region[i + 3] for i in range(3)):
            raise RuntimeError(f"Connector selection bounds changed for {spec['name']}")
        objects.append({**spec, "kind": "connector_detail", "source": sources[board], "schematic": False,
                        "origin_normalized_mm": spec["origin"], "original_board_bounds": b,
                        "geometry_provenance": "Whole manufacturer solid, translated without clipping",
                        **tessellate(translate(shape, spec["origin"]), args.detail_deflection, .20)})
    objects.append({"name": "detail_xiao_b2b_schematic", "detail_key": "xiao-b2b", "board": "xiao", "kind": "connector_detail",
                    "role": "b2b_socket", "material": "dark", "schematic": True,
                    "source": {"path": "scripts/export_step_meshes.py", "description": "Procedural mating socket"},
                    "origin_normalized_mm": [6.731, 19.4056, 1.25], "socket_rim_local_z_mm": .95,
                    "socket_floor_local_z_mm": .25,
                    **tessellate(translate(additions["xiao_socket_schematic"], [6.731, 19.4056, 1.25]), args.detail_deflection, .20)})
    for obj in objects:
        obj["category"] = obj["kind"]
    data = {"metadata": metadata, "objects": objects}
    target = args.output / "official-meshes.json.gz"
    payload = json.dumps(data, separators=(",", ":"), allow_nan=False).encode()
    with target.open("wb") as out:
        with gzip.GzipFile(filename="", mode="wb", fileobj=out, mtime=0) as encoded:
            encoded.write(payload)
    manifest = {"metadata": metadata, "library": target.name, "sha256": sha256(target),
                "objects": [{k: v for k, v in obj.items() if k not in ("vertices", "faces", "edges")}
                            for obj in objects],
                "totals": {"objects": len(objects), "vertices": sum(len(o["vertices"]) for o in objects),
                           "triangles": sum(len(o["faces"]) for o in objects),
                           "feature_segments": sum(len(o["edges"]) for o in objects)}}
    (args.output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["totals"]), flush=True)
    print(f"Wrote {target}", flush=True)


if __name__ == "__main__":
    main()
