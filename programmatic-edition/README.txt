XIAO ESP32S3 + Wio-SX1262 assembly guide

This edition is generated entirely with code. No AI image generation was used,
including for the small parts. The board drawings reuse visible-edge projections
from official Seeed STEP models. Antenna sheets, coax cables, stamped plugs,
arrows, labels and page layouts are procedural SVG geometry.

DELIVERABLES

output/xiao-wio-assembly.png: 3600 x 2546 full-resolution sheet
output/xiao-wio-assembly.svg: editable, self-contained vector sheet
output/xiao-wio-assembly.pdf: one-page A3 landscape vector PDF
output/01-parts through 04-join-boards: four 1920 x 1080 PNGs and SVGs

REBUILD

Requires Node.js, sharp, playwright, and Google Chrome or Chromium.
No CAD runtime is needed to rebuild the delivered sheet and step images.

On the original machine:
  node build.mjs

Elsewhere, install the two Node packages and provide their directory:
  npm install sharp playwright
  CODEX_NODE_MODULES="$PWD/node_modules" CHROME_PATH="/path/to/chrome" node build.mjs

build.mjs reads the local geometry/*.svg and geometry/*.json snapshots and
writes output/. These inputs are reused unchanged in every assembly step.
geometry/render_native.py records the upstream CAD projection method. Its
source paths refer to the original workspace and it is not required by build.mjs.
geometry/PROVENANCE.md documents the original CAD export and simplifications.

HARDWARE BASIS

This is the ESP32S3 version of the kit, joined by a small board-to-board
connector. It is not the nRF52840 version that uses the side headers.
Wio is above XIAO, with both component sides up. The mounting-hole/button end
of Wio is at the USB end of XIAO. Antennas are attached before joining boards.
Already soldered XIAO headers are shown to match the user's physical kit.

The original STEP files omit some kit details. The XIAO connector, headers,
Wio button, FPC antennas and antenna plugs are documented reconstructions.
Cable bends, plug shapes and the enlarged board gap are illustrative.
The nominal assembled height is not a measured enclosure-design dimension.
The Wi-Fi antenna outline uses Seeed's A-02 reference, which does not establish
the precise dimensions of all kit revisions. This is an assembly illustration,
not a dimensioned manufacturing drawing. Firmware, battery wiring, enclosures
and optional adhesive steps are outside the requested sequence.

REFERENCE SOURCES

Kit and assembly photos:
https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/

Wio STEP model:
https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step

XIAO STEP archive:
https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip

Wi-Fi antenna installation:
https://wiki.seeedstudio.com/xiao_esp32s3_wifi_usage/

Wi-Fi A-02 antenna drawing:
https://files.seeedstudio.com/wiki/XIAO_WiFi/antenna/FPC_Antenna_2.4GHz_1.16dbi_for_XIAO_ESP32S3/res/Datasheet_2.4GHz_FPC_Antenna_1.16dbi_for_XIAO_ESP32S3.pdf

LoRa antenna dimensions:
https://files.seeedstudio.com/wiki/XIAO_ESP32S3_for_Meshtastic_LoRa/37.png

The original local hardware photographs were used only for verification.
They are not embedded in the delivered illustrations or this source bundle.
See sources.json for paths, provenance and hashes.

VALIDATION

The final PDF was rendered with Poppler and visually inspected.
Its single A3 landscape page contains zero raster image objects.
All SVG drawings are local vector geometry with selectable text.
The same CAD components are used across all four steps.
