MESH KIT: LDRAW + LPUB3D EDITION
XIAO ESP32S3 and Wio-SX1262
Revised 2026-10-19

Five 16:9 pages with larger diagrams, antenna-plug close-ups, a rear
board-to-board connector close-up, and a single-page steps 01-04 overview.
The combined overview includes a plug close-up beside each antenna step
and the rear connector close-up beside step 04.
All 3D images are native LPub3D renders of LDraw geometry. LPub3D also lays
out the pages and exports the PDF text. No AI image generation was used.

OPEN AND EDIT

Open mesh-kit.mpd in LPub3D using the Native renderer. Keep the assets
folder alongside the MPD, as it supplies the independently placed images.
The first page also contains the native XIAO assembly directly.

Open geometry.mpd to edit the fourteen source render scenes. All custom
DAT parts are included inline. Individual editable parts are in parts/.
The build scripts regenerate both MPD files from those definitions.

OUTPUTS

  mesh-kit-lpub3d.pdf           Five 16:9 instruction pages
  pages/                      Five direct LPub3D PNG exports, 2000 x 1125
  mesh-kit-all-steps.png        Page five, all steps 01-04 on one slide
  mesh-kit-preview.png          Smaller preview of the all-steps slide
  mesh-kit-assembly-sheet.png  Contact sheet of all five pages
  mesh-kit-ldraw-source.zip    Portable source, assets and output package

OFFICIAL MODELS

The two manufacturer STEP files are preserved in source-models. Their
hashes are recorded in parts/boards-manifest.json. The original CAD feature
curves provide black outlines, while tessellation seams remain hidden.
The antenna sockets and Wio underside connector close-ups use complete
solids extracted from the same official STEP files. Solid identifiers,
coordinate normalization and hashes are recorded in
parts/connector-details-manifest.json.

XIAO source:
https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip

Wio source:
https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step

Kit reference:
https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/

Wi-Fi antenna reference:
https://files.seeedstudio.com/wiki/XIAO_WiFi/antenna/FPC_Antenna_2.4GHz_1.16dbi_for_XIAO_ESP32S3/res/Datasheet_2.4GHz_FPC_Antenna_1.16dbi_for_XIAO_ESP32S3.pdf

LoRa antenna comparison:
https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/37.png

LDraw format: https://www.ldraw.org/article/218.html
LPub3D: https://trevorsandy.github.io/lpub3d/

ADDED INSTRUCTIONAL GEOMETRY

The official STEP files omit the antennas, XIAO populated B2B socket,
installed XIAO headers and Wio pushbutton. Those are separate procedural
parts. Antenna outlines are 37.4 x 17.5 mm for Wi-Fi and 40 x 7 mm for LoRa.
Cable bends, plug caps, PCB patches, sheet thickness, header depths and the
XIAO mating socket are simplified for instructional clarity. Page four
labels that socket as simplified. The close-ups show alignment and pressing
direction, not individual electrical contacts or an exact mechanical fit.

Simple ESP32-S3 and SX1262 identifiers are printed on the two large shield
surfaces using flat LDraw polygons. They follow the board perspective in
every view. These are simplified identification labels, not exact factory
artwork. The separate xiao-markings.dat and wio-markings.dat parts preserve
the original manufacturer DAT files without modification. Their provenance
is recorded in parts/markings-manifest.json.

CAD axes are X across the PCB, Y from USB toward the rear antenna edge and
Z upward. One millimeter maps to 2.5 LDraw units using (X, Y, Z) -> (X,-Z,Y).
Wio is above XIAO with both shields up. The joined scene uses a nominal Wio
PCB offset of 5 mm, not a measured enclosure-design datum. Official STEP
bodies have zero intersection at this offset. The supplementary XIAO socket
intersects the Wio connector internally, so this is not fit validation.

REBUILD

With LPub3D installed:

  python3 scripts/export_lpub3d.py

This renders geometry.mpd at 300 DPI, copies fourteen tightly cropped native
renders to assets/, rebuilds the five-page layout, then exports PDF and PNG.
For layout-only edits with the existing assets:

  python3 scripts/export_lpub3d.py --reuse-assets

On another platform use --lpub3d /path/to/executable or LPUB3D_BIN. Set
LDRAWDIR to an extracted LDraw library. On macOS the wrapper can extract the
library included with LPub3D into library/. LDView and POV-Ray are not needed.

To regenerate the original STEP conversions and detail extraction:

  python3 -m venv .venv
  .venv/bin/pip install cadquery-ocp==7.9.3.1.1
  .venv/bin/python scripts/convert_boards.py
  .venv/bin/python scripts/extract_connector_details.py
  python3 scripts/export_lpub3d.py

To validate and package:

  python3 -m pip install Pillow pypdf
  python3 scripts/package_outputs.py

LPUB3D NOTES

LPub3D 2.4.9 r86 for Apple Silicon was used. Custom Unofficial_Part sections
keep component geometry together. LEGO parts lists are disabled. Arrows
are LDraw geometry. The export wrapper validates CameraProjection in actual
renderer logs and can restart LPub3D to apply its saved native preference.
Named cameras were avoided due to a crash in this macOS build.

The layout combines native rendered pictures and native PDF text. It is not
an all-vector CAD drawing. Keep the complete source package for editing.
research/validation.json records integrity and export checks.

This is an unofficial guide. Manufacturer geometry retains its original
ownership. These are not official LDraw library releases.
