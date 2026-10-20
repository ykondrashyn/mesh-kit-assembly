#!/usr/bin/env python3
"""Extract whole connector solids for magnified native LDraw instructions.

No geometric clipping is used. Complete source solids are selected by their
documented normalized bounding boxes, then translated into a local frame.
The board X/Y directions are unchanged. One millimeter remains 2.5 LDU.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from OCP.Bnd import Bnd_Box
from OCP.BRepBndLib import BRepBndLib
from OCP.BRepBuilderAPI import BRepBuilderAPI_Transform
from OCP.BRepGProp import BRepGProp
from OCP.GProp import GProp_GProps
from OCP.TopAbs import TopAbs_SOLID
from OCP.TopExp import TopExp_Explorer
from OCP.gp import gp_Trsf, gp_Vec

import convert_boards as boards


DETAILS = {
    "detail-xiao-rf-official": {
        "board": "xiao", "kind": "rf", "schematic": False,
        "selection_box_normalized_mm": [12.0, 17.65, 1.20, 15.22, 20.80, 2.55],
        "origin_normalized_mm": [13.61668, 19.23344, 1.25],
        "board_surface": "XIAO PCB top", "mating_plane_local_z_mm": 1.25,
        "source_component": "U.FL-R-SMT-1_10_ v1:1",
    },
    "detail-wio-rf-official": {
        "board": "wio", "kind": "rf", "schematic": False,
        "selection_box_normalized_mm": [3.85, 17.88, 1.59, 6.95, 21.08, 2.95],
        "origin_normalized_mm": [5.3984, 19.47932, 1.60],
        "board_surface": "Wio PCB top", "mating_plane_local_z_mm": 1.30,
        "source_component": "RF socket solid within U1 Wio-SX1262 module",
    },
    "detail-wio-b2b-official": {
        "board": "wio", "kind": "b2b", "schematic": False,
        "selection_box_normalized_mm": [2.38, 17.63, -3.55, 11.08, 21.18, -.05],
        "origin_normalized_mm": [6.731, 19.4056, 0.0],
        "board_surface": "Wio PCB underside", "mating_tip_local_z_mm": -3.5,
        "source_component": "J3 BF04-30pin-35H",
    },
    "detail-xiao-b2b-schematic": {
        "board": "xiao", "kind": "b2b", "schematic": True,
        "selection_box_normalized_mm": [2.38, 17.63, 1.20, 11.08, 21.18, 2.25],
        "origin_normalized_mm": [6.731, 19.4056, 1.25],
        "board_surface": "XIAO PCB top", "socket_rim_local_z_mm": .95,
        "socket_floor_local_z_mm": .25,
        "source_component": "Illustrative B2B socket from kit supplemental geometry",
    },
}


def bbox(shape):
    bound = Bnd_Box()
    BRepBndLib.AddOptimal_s(shape, bound, False, False)
    return list(bound.Get())


def volume(shape):
    props = GProp_GProps()
    BRepGProp.VolumeProperties_s(shape, props)
    return props.Mass()


def select_whole_solids(shape, region):
    chosen, info = [], []
    iterator = TopExp_Explorer(shape, TopAbs_SOLID)
    index = 0
    while iterator.More():
        solid = iterator.Current()
        bounds = bbox(solid)
        if all(bounds[i] >= region[i] and bounds[i + 3] <= region[i + 3] for i in range(3)):
            chosen.append(solid)
            info.append({"index_zero_based": index, "bbox_normalized_mm": bounds,
                         "volume_mm3": volume(solid)})
        iterator.Next()
        index += 1
    if len(chosen) != 1:
        raise RuntimeError(f"Expected exactly one complete connector solid, found {len(chosen)}")
    return chosen[0], info


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    local = boards.EDITION / "source-models"
    parser.add_argument("--references", type=Path,
                        default=local if local.exists() else boards.MANUAL / "references")
    parser.add_argument("--output", type=Path, default=boards.EDITION / "parts")
    parser.add_argument("--deflection", type=float, default=.008)
    parser.add_argument("--angle", type=float, default=.20)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.deflection <= 0 or args.angle <= 0:
        parser.error("Mesh tolerances must be positive")
    supplement_file = local / "supplement-definition.py"
    if not supplement_file.exists():
        supplement_file = boards.MANUAL / "cad-edition/cad/render_native.py"
    native = {key: boards.load_step(args.references / boards.SOURCE_FILES[key], boards.TRANSFORMS[key])
              for key in ("xiao", "wio")}
    manifest = {
        "extraction": "Whole source solids selected by bounding-box containment, no Boolean cuts or clipped faces",
        "ldu_per_mm": boards.LDU_PER_MM,
        "coordinate_mapping": "LDraw = 2.5 * [local_X, -local_Z, local_Y]",
        "orientation": "Local X and Y match normalized boards, local Z points up, the named PCB surface is local Z=0",
        "board_geometry_included": False,
        "detail_mesh_chordal_deflection_mm": args.deflection,
        "detail_mesh_angle_rad": args.angle,
        "b2b_composition": {
            "xiao_origin_local_mm": [0, 0, 0],
            "wio_origin_for_nominal_mating_local_mm": [0, 0, 3.75],
            "wio_origin_for_nominal_mating_ldu": [0, -9.375, 0],
            "rotations": "None, both connectors retain their installed board orientation",
            "suggested_exploded_wio_origin_local_mm": [0, 0, 8],
            "limitation": "XIAO socket is schematic and omits contacts. Nominal mating is illustrative, not a verified mechanical fit.",
            "underside_view_transform_ldraw_3x3": [1, 0, 0, 0, -1, 0, 0, 0, -1],
            "underside_view_note": "Optional 180 degree X rotation only for a separately labeled Wio underside inspection view, not the mating scene",
        },
        "parts": {},
    }
    for name, spec in DETAILS.items():
        board = spec["board"]
        source = supplement_file if spec["schematic"] else args.references / boards.SOURCE_FILES[board]
        shape = boards.supplements(board) if spec["schematic"] else native[board]
        selected, selection = select_whole_solids(shape, spec["selection_box_normalized_mm"])
        origin = spec["origin_normalized_mm"]
        transform = gp_Trsf()
        transform.SetTranslation(gp_Vec(*[-v for v in origin]))
        centered = BRepBuilderAPI_Transform(selected, transform, True).Shape()
        original_volume = volume(selected)
        translated_volume = volume(centered)
        if abs(original_volume - translated_volume) > max(1e-7, original_volume * 1e-8):
            raise RuntimeError(f"Translation changed solid volume for {name}")
        metadata = dict(spec, source_file=str(source), source_sha256=boards.sha256(source),
                        geometry_provenance=("Schematic supplemental XIAO B2B socket, not manufacturer geometry"
                                             if spec["schematic"] else "Complete manufacturer STEP connector solid"),
                        source_to_normalized_mm_3x4=([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]
                                                    if spec["schematic"] else boards.TRANSFORMS[board]),
                        normalized_to_local_translation_mm=[-v for v in origin],
                        origin_on_board_ldu=boards.ldraw(origin),
                        axis_local_mm=[0, 0], local_board_plane_z_mm=0,
                        local_orientation="X rightward across board, Y toward rear antenna edge, Z up",
                        selected_whole_solids=selection,
                        selected_source_volume_mm3=original_volume,
                        exported_local_volume_mm3=translated_volume,
                        bbox_on_original_board_mm=bbox(selected))
        if not spec["schematic"]:
            metadata["source_url"] = boards.SOURCE_URLS[board]
        result = boards.export(centered, name, args.output, metadata, args.deflection, args.angle)
        result["cad_bounds_local_mm"] = result.pop("cad_bounds_normalized_mm")
        (args.output / (name + ".json")).write_text(json.dumps(result, indent=2) + "\n")
        manifest["parts"][name] = result
    (args.output / "connector-details-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
