#!/usr/bin/env python3
"""Convert official Seeed STEP solids to reusable native 3D LDraw parts.

Run with ../.venv/bin/python convert_boards.py, from any directory.
Requires cadquery-ocp 7.9.3.1.1. No raster or image-generation inputs.
Official geometry and illustrative kit additions remain separate parts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from OCP.Bnd import Bnd_Box
from OCP.BRep import BRep_Builder, BRep_Tool
from OCP.BRepAdaptor import BRepAdaptor_Curve
from OCP.BRepAlgoAPI import BRepAlgoAPI_Cut
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepMesh import BRepMesh_IncrementalMesh
from OCP.BRepPrimAPI import BRepPrimAPI_MakeBox, BRepPrimAPI_MakeCylinder
from OCP.GCPnts import GCPnts_QuasiUniformDeflection
from OCP.IFSelect import IFSelect_RetDone
from OCP.STEPControl import STEPControl_Reader
from OCP.TopAbs import TopAbs_EDGE, TopAbs_FACE, TopAbs_REVERSED
from OCP.TopExp import TopExp_Explorer
from OCP.TopLoc import TopLoc_Location
from OCP.TopTools import TopTools_IndexedMapOfShape
from OCP.TopoDS import TopoDS, TopoDS_Compound
from OCP.gp import gp_Ax2, gp_Dir, gp_Pnt, gp_Trsf

EDITION = Path(__file__).resolve().parents[1]
MANUAL = EDITION.parent
LDU_PER_MM = 2.5
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


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ldraw(point):
    """Normalized millimeters (X,Y,Z) to LDraw units (X,-Z,Y)."""
    x, y, z = point
    return tuple(round(v * LDU_PER_MM, 6) for v in (x, -z, y))


def fmt(point):
    return " ".join(f"{0 if abs(v) < 0.0000005 else v:.6f}" for v in point)


def load_step(path, transform):
    reader = STEPControl_Reader()
    if reader.ReadFile(str(path)) != IFSelect_RetDone:
        raise RuntimeError(f"Unable to read STEP: {path}")
    if not reader.TransferRoots():
        raise RuntimeError(f"No STEP roots transferred: {path}")
    tr = gp_Trsf()
    tr.SetValues(*transform)
    return BRepBuilderAPI_Transform(reader.OneShape(), tr, True).Shape()


def compound(parts):
    builder, shape = BRep_Builder(), TopoDS_Compound()
    builder.MakeCompound(shape)
    for part in parts:
        builder.Add(shape, part)
    return shape


def box(x, y, z, dx, dy, dz):
    return BRepPrimAPI_MakeBox(gp_Pnt(x, y, z), dx, dy, dz).Shape()


def supplements(board):
    """Exact supplemental definitions from cad-edition/cad/render_native.py."""
    if board == "xiao":
        socket = BRepAlgoAPI_Cut(
            box(2.4307, 17.6884, 1.25, 8.6, 3.4344, .95),
            box(3.05, 18.24, 1.50, 7.35, 2.3, .85),
        ).Shape()
        parts = [socket]
        for x in (1.27, 16.51):
            parts.append(box(x - 1.22, 1.651, -2.2, 2.44, 17.78, 2.2))
            for i in range(7):
                parts.append(box(x - .32, 2.921 + 2.54 * i - .32, -6.2, .64, .64, 6.3))
        return compound(parts)
    button = BRepPrimAPI_MakeCylinder(
        gp_Ax2(gp_Pnt(8.89, 8.07, 2.15), gp_Dir(0, 0, 1)), .93, .45
    ).Shape()
    return compound([box(7.00, 6.72, 1.60, 3.78, 2.70, .55), button])


def cross_area_squared(a, b, c):
    u = [b[i] - a[i] for i in range(3)]
    v = [c[i] - a[i] for i in range(3)]
    w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
         u[0] * v[1] - u[1] * v[0]]
    return sum(k * k for k in w)


def tessellate(shape, deflection, angle):
    BRepMesh_IncrementalMesh(shape, deflection, False, angle, True)
    faces = TopExp_Explorer(shape, TopAbs_FACE)
    triangles, seen, seam_edges = [], set(), TopTools_IndexedMapOfShape()
    face_count = 0
    while faces.More():
        face = TopoDS.Face_s(faces.Current())
        loc = TopLoc_Location()
        mesh = BRep_Tool.Triangulation_s(face, loc)
        if mesh is None:
            raise RuntimeError(f"Face {face_count} has no triangulation")
        nodes = [ldraw(mesh.Node(i).Transformed(loc.Transformation()).Coord())
                 for i in range(1, mesh.NbNodes() + 1)]
        for i in range(1, mesh.NbTriangles() + 1):
            ids = list(mesh.Triangle(i).Get())
            if face.Orientation() == TopAbs_REVERSED:
                ids.reverse()
            pts = tuple(nodes[j - 1] for j in ids)
            key = tuple(sorted(pts))
            if key not in seen and cross_area_squared(*pts) > 1e-18:
                triangles.append(pts)
                seen.add(key)
        edges = TopExp_Explorer(face, TopAbs_EDGE)
        while edges.More():
            edge = TopoDS.Edge_s(edges.Current())
            if BRep_Tool.IsClosed_s(edge, face):
                seam_edges.Add(edge)
            edges.Next()
        faces.Next()
        face_count += 1
    return triangles, seam_edges, face_count


def feature_edges(shape, seams, deflection):
    """Sample original BRep edges, never triangle boundaries.

    Periodic surface seam edges are suppressed. Type-2 3D lines are occluded
    by the viewer's surface depth buffer, preserving arbitrary camera views.
    """
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
        curve = BRepAdaptor_Curve(edge)
        sample = GCPnts_QuasiUniformDeflection(curve, deflection)
        if not sample.IsDone():
            raise RuntimeError("Failed to sample a CAD feature edge")
        pts = [ldraw(sample.Value(i).Coord()) for i in range(1, sample.NbPoints() + 1)]
        for a, b in zip(pts, pts[1:]):
            key = tuple(sorted((a, b)))
            if a != b and key not in seen:
                segments.append((a, b))
                seen.add(key)
    return segments, {"unique_brep_edges": edges_seen.Extent(), "suppressed_periodic_or_degenerate_edges": suppressed}


def bounds(points):
    return {"min": [min(p[i] for p in points) for i in range(3)],
            "max": [max(p[i] for p in points) for i in range(3)]}


def export(shape, name, out, metadata, deflection, angle):
    triangles, seams, faces = tessellate(shape, deflection, angle)
    segments, edge_stats = feature_edges(shape, seams, deflection / 2)
    title = ("Seeed " + name.replace("-", " "))
    header = [f"0 {title}", f"0 Name: {name}.dat", "0 Author: Seeed Studio source geometry, programmatic conversion",
              "0 !LDRAW_ORG Unofficial_Part", "0 BFC NOCERTIFY",
              "0 // Full 3D CAD tessellation, not a projected illustration",
              "0 // 1 mm = 2.5 LDU, normalized (X,Y,Z) maps to LDraw (X,-Z,Y)",
              "0 // Type 2 lines are original BRep feature edges, not triangle seams",
              f"0 // Geometry provenance: {metadata['geometry_provenance']}",
              f"0 // Source SHA256: {metadata['source_sha256']}"]
    content = header + ["3 15 " + " ".join(fmt(p) for p in tri) for tri in triangles]
    content += ["2 0 " + fmt(a) + " " + fmt(b) for a, b in segments]
    target = out / (name + ".dat")
    target.write_text("\n".join(content) + "\n")
    bbox = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, bbox, False, False)
    b = list(bbox.Get())
    result = dict(metadata, filename=target.name, triangles=len(triangles), type_2_segments=len(segments),
                  faces=faces, **edge_stats, output_sha256=sha256(target),
                  cad_bounds_normalized_mm={"min": b[:3], "max": b[3:]},
                  mesh_bounds_ldu=bounds([p for tri in triangles for p in tri]),
                  file_bytes=target.stat().st_size)
    if not triangles or not segments:
        raise RuntimeError(f"Empty surface or edge export: {name}")
    (out / (name + ".json")).write_text(json.dumps(result, indent=2) + "\n")
    print(f"{name}: {len(triangles)} triangles, {len(segments)} feature segments", flush=True)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    local_sources = EDITION / "source-models"
    parser.add_argument("--references", type=Path, default=local_sources if local_sources.exists() else MANUAL / "references")
    parser.add_argument("--output", type=Path, default=EDITION / "parts")
    parser.add_argument("--deflection", type=float, default=.025, help="Chordal tolerance in mm")
    parser.add_argument("--angle", type=float, default=.25, help="Angular mesh tolerance in radians")
    args = parser.parse_args()
    if args.deflection <= 0 or args.angle <= 0:
        parser.error("Mesh tolerances must be positive")
    args.output.mkdir(parents=True, exist_ok=True)
    supplement_source = local_sources / "supplement-definition.py"
    if not supplement_source.exists():
        supplement_source = MANUAL / "cad-edition/cad/render_native.py"
    manifest = {
        "format": "Native 3D LDraw DAT",
        "ldu_per_mm": LDU_PER_MM,
        "coordinate_mapping": "ldraw = 2.5 * [normalized_X, -normalized_Z, normalized_Y]",
        "normalization": "X across board, Y from USB end toward antenna edge, Z upward",
        "triangle_colour": "15 White", "feature_edge_colour": "0 Black",
        "edge_policy": "Original BRep feature curves only, periodic seams omitted, renderer hides occluded 3D lines",
        "mesh_chordal_deflection_mm": args.deflection, "mesh_angle_rad": args.angle,
        "supplement_definition_file": str(supplement_source),
        "supplement_definition_sha256": sha256(supplement_source),
        "stacking": {"wio_z_offset_mm": 5.0, "wio_ldraw_translation": [0, -12.5, 0],
                     "status": "Illustrative nominal spacing, not a manufacturing measurement"},
        "parts": {},
    }
    for key in ("xiao", "wio"):
        source = args.references / SOURCE_FILES[key]
        common = {"board": key, "source_file": str(source), "source_url": SOURCE_URLS[key],
                  "source_sha256": sha256(source), "source_to_normalized_mm_3x4": TRANSFORMS[key],
                  "landmarks_normalized_mm": LANDMARKS[key],
                  "landmarks_ldu": {k: ldraw(v) for k, v in LANDMARKS[key].items()}}
        for kind, shape in (("official", load_step(source, TRANSFORMS[key])), ("kit-details", supplements(key))):
            name = key + "-" + kind
            metadata = dict(common, geometry_provenance=("Manufacturer STEP" if kind == "official" else
                "Illustrative additions from photographed kit, authored with CAD primitives"))
            if kind == "kit-details":
                metadata["supplements"] = (["Simplified populated B2B socket", "Two seven-pin header bodies and pins"]
                                            if key == "xiao" else ["Simplified user button"])
                metadata["official_step_source_file"] = str(source)
                metadata["official_step_source_sha256"] = sha256(source)
                metadata["source_file"] = str(supplement_source)
                metadata.pop("source_url")
                metadata["source_sha256"] = sha256(supplement_source)
                metadata["source_to_normalized_mm_3x4"] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
            manifest["parts"][name] = export(shape, name, args.output, metadata, args.deflection, args.angle)
    (args.output / "boards-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
