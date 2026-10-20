MESH KIT: BLENDER EDITION
XIAO ESP32S3 + Wio-SX1262
2026-10-19

Five 16:9 instruction pages, including a combined steps 01-04 page with
both antenna-plug close-ups and the rear board-to-board connector close-up.
Simple ESP32-S3 and SX1262 identifiers sit on the two shield surfaces.

IKEA-style detail callouts mark the source connector area with a circle or
oval and connect it to a true circular enlargement with a thin leader line.
These unarrowed leaders are distinct from the filled arrows that show where
to press. All eight close-up views use circular insets across six linked
callouts, including all three details on the combined page. Each diagram is
fitted to its circle using its actual projected outline, with a small gap
at the border. The pages use monochrome materials and dark outlines.

OPEN AND EDIT

Open mesh-kit.blend in Blender. It opens on the combined page. Select the
other pages using Blender's scene menu. Numpad 0 selects the page camera.
F12 renders the selected page at 3200 x 1800.

Each diagram is a collection with a named parent empty, for example
"main-exploded / move or scale this view". Move or scale that empty to lay
out the diagram. Its children remain separate editable mesh components,
original CAD edge curves, native Bezier cables, arrows and text objects.
Page captions and chip identifiers are editable Blender text. The fonts
are packed in the file. The project has no external image dependencies.

The five scenes contain all page design and all 3D rendering. No LDraw,
LPub3D, external layout application or AI image generation is used.

OUTPUTS

  mesh-kit.blend                    Editable five-scene Blender project
  output/mesh-kit-blender.pdf       Five instruction pages
  output/pages/                    Five 3200 x 1800 native Blender PNGs
  output/mesh-kit-all-steps.png     Full-resolution combined page
  output/mesh-kit-preview.png       1600 x 900 combined preview
  output/mesh-kit-blender-source.zip  Portable source and output package

All page pixels come from Blender EEVEE with orthographic cameras.
The PDF writer runs inside Blender and wraps the original PNG compressed
pixel streams losslessly. It does not compose or redraw the pages. PDF
pages are raster renders, while the original geometry and text remain
editable in mesh-kit.blend.

MANUFACTURER GEOMETRY

Original official STEP files are included in source-models/. All 37 XIAO
solids and all 9 Wio solids are retained. The STEP-to-mesh conversion uses
OpenCascade, with normalized millimeter coordinates and original CAD
feature edges. No images are used to reconstruct the boards.

Source URLs, SHA-256 hashes, transformations, landmarks, triangle counts
and component provenance are recorded in meshes/manifest.json.

XIAO:
https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip

Wio:
https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step

Kit reference:
https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/

The two RF sockets and Wio underside board connector in the close-ups
are complete solids extracted from these same STEP models. X and Y keep
the installed orientation. Z points upward from the named PCB surface.

ANTENNA PLUGS

The Wi-Fi plug uses I-PEX's MHF I 20278-1xxR-13 manufacturer STEP for
1.13 mm coax. The LoRa plug uses the separate MHF I 20351-1xxR-37 STEP
for 1.37 mm coax, including its longer crimp and thicker cable stub.
The complete folded shell, circular mating sleeve, crimp and short cable
stub are retained. Native Blender Bezier leads join the stub tangentially.
The seated views place the sleeve around the board receptacle using the
manufacturer's mated assembly datum, rather than placing a flat cap on top.

The Wi-Fi source contains the engraved 13 and the LoRa source contains 37.
The LoRa plug also carries a separate native text object reading C M below
37, matching the user's observation of their physical antenna connector.
The meaning and manufacturer associated with C M have not been verified.
It is not part of the I-PEX CAD and is tagged as illustrative stamp artwork.
No original CAD faces were removed to add this text.

I-PEX's product table identifies 20278-112R-13 with 1.13 mm cable and
20351-112R-37 with 1.37 mm cable. These are cable-size variants in the same
MHF I mating family, not Wi-Fi or LoRa frequency identifiers. The user's
reported 13 and 37 stamps are consistent with those cable variants, but
do not by themselves prove that the kit's connectors were made by I-PEX.
See research/connector-markings.json for evidence and its limits.

The connector style was compared visually with Seeed's kit photograph,
the original Wi-Fi antenna gallery photos and I-PEX's connector photograph
and dimensioned drawing. Both Seeed antennas visibly use the same general
U.FL / MHF I style. The exact supplier and part number used in a particular
Seeed kit are unconfirmed. This is representative manufacturer geometry,
not a claim that the kit contains I-PEX-branded plugs.

I-PEX product, photos, drawings and official CAD:
https://www.i-pex.com/product/mhf-I

Seeed antenna gallery:
https://www.seeedstudio.com/2-4GHz-FPC-Antenna-1-16dBi-for-XIAO-ESP32S3-p-6440.html

Downloaded reference photos and drawings are retained in references/.
Their original URLs are recorded in references/sources.json. These images
are research references only and are not used as Blender scene textures.
Plug geometry, dimensions and provenance are recorded in the RF plug
manifest under meshes/.

ILLUSTRATIVE ADDITIONS

The source files omit the antennas, populated XIAO mating socket, fitted
XIAO header pins and Wio pushbutton. These are separate supplemental
objects. The XIAO socket is labelled simplified on pages 4 and 5.

The antenna outlines retain the documented sizes: Wi-Fi 37.4 x 17.5 mm,
LoRa 40 x 7 mm. Cable bends, film thickness, connector-context
PCB patches, header depths and the XIAO socket are instructional models.
The close-ups explain alignment and pressing direction, not individual
electrical contacts or a verified mechanical fit.

The exploded step 04 layout places LoRa to the left with a relaxed cable
arc clear of the ESP32 board. The same arrangement drives the dedicated and combined
pages. The joined board spacing is nominally 5 mm, not an enclosure-design
measurement. Simplified socket geometry is not evidence of physical fit.

Shield text and monochrome materials aid identification. They
are simplified artwork and styling, not exact factory printing or colors.

RENDER WITHOUT REBUILDING GEOMETRY

  blender --background mesh-kit.blend --python scripts/render_saved.py

REBUILD ALL BLENDER SCENES AND OUTPUTS

  blender --background --factory-startup --python scripts/build_blender.py

This uses the included neutral mesh library and requires only Blender.
The build script selects the system Arial fonts on macOS. The delivered
.blend already contains its fonts and can be opened on other platforms.

To rebuild the mesh library directly from the official STEP files:

  python3 -m venv .venv
  .venv/bin/pip install cadquery-ocp==7.9.3.1.1
  .venv/bin/python scripts/export_step_meshes.py
  .venv/bin/python scripts/export_rf_plug.py
  .venv/bin/python scripts/export_rf_plug_137.py

The STEP conversion is only an import step. All modeling additions,
materials, camera framing, page layout, text and rendering are native
Blender operations. Blender 5.2.1 LTS was used for the delivered project.

This is an unofficial assembly guide. Manufacturer geometry retains its
original ownership.
