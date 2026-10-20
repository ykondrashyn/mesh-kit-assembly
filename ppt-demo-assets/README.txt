MESH KIT: POWERPOINT DEMO ASSETS
XIAO ESP32S3 + Wio-SX1262

Open index.html to browse the assets. Drag the PNG files onto your slides,
or insert them as pictures. Keep their original aspect ratio when resizing.
The files work best on white or light slide backgrounds.
The animation can be inserted as a video from your computer.

01-parts
  Four separate parts with transparent backgrounds, 2000 px on the long edge.
  XIAO ESP32S3, Wio-SX1262, Wi-Fi antenna and LoRa antenna.

02-assembly
  Four transparent assembly diagrams, 2400 px on the long edge.
  Connect Wi-Fi, connect LoRa, align the boards and boards joined.

03-closeups
  Five circular connector close-ups, 1800 x 1800 px.
  Wi-Fi aligned and seated, LoRa aligned and seated, board connector aligned.
  The outside is transparent. The circle interior is white.

04-linked-panels
  Three complete panels, 3200 px on the long edge.
  Each main diagram includes its source ring, leader and circular close-up.
  Use these when you want the enlargement to remain visibly connected to
  the assembly it explains.

05-ready-slides
  Five complete 3200 x 1800 images for a widescreen 16:9 presentation.
  Includes steps 01, 02, 03 and 04, plus the combined 01-04 slide.

06-animation
  A 17-second, 1920 x 1080 MP4 at 30 fps, with no audio.
  Opens with LoRa antenna, Wio, Wi-Fi antenna and XIAO in a horizontal line.
  Shows both antenna connections and board stacking with synchronized
  circular close-ups. Ends with the assembled kit and a final still hold.
  Includes a poster PNG, editable Blender project and build/render scripts.
  See 06-animation/README.txt for PowerPoint playback and source instructions.

07-animation-portrait
  The same 17-second sequence in 1080 x 1920, 9:16 portrait orientation.
  Opens with the same ordered parts in a vertical line.
  The assembly appears above a larger circular connector close-up.
  Includes an MP4, poster, editable Blender project and build/render scripts.
  See 07-animation-portrait/README.txt for insertion and source instructions.

SUGGESTED CAPTIONS

  Wi-Fi: Broad antenna to XIAO. Press straight down.
  LoRa: Narrow antenna to Wio. Press straight down.
  Boards: Wio above XIAO. Align the small connector, then press down.
  Board connector close-up: XIAO socket shown simplified.

Every antenna film is labelled Wi-Fi / 2.4 GHz or LoRa / 868 MHz.
The artwork and chip markings are part of the images. Add your own editable
titles and captions in PowerPoint. These are image assets, not editable
PowerPoint shapes or embedded 3D models. The labelled editable Blender guide
is in _source/ppt-assets-labeled.blend. The original manual master remains
in ../blender-edition/mesh-kit.blend.

REFERENCE DETAILS

The latest artwork is included: Wi-Fi plug marked 13, LoRa plug marked 37
with C M below it, circular close-ups and the curved LoRa cable in step 04.
The plug models are representative I-PEX MHF I CAD for 1.13 and 1.37 mm
coax. The exact kit supplier and the meaning of C M remain unverified.
The XIAO mating socket is simplified. Keep that caption with its close-up.

All diagrams were rendered directly in Blender from the existing project.
No AI image generation was used. The original guide was not modified.

REBUILD

From this directory:
  blender --background ../blender-edition/mesh-kit.blend --python _source/export_ppt_assets.py

The script and manifest in _source record the original Blender file hash
and the dimensions and transparency of each asset.
