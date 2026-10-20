# CAD technical illustration assets

These illustrations use visible edges and silhouettes projected from the official Seeed STEP files. They are not image generation approximations.

## Source geometry

- Wio-SX1262 for XIAO V1.0: `../../references/wio-sx1262-for-xiao.step`, manufacturer model dated 2024-09-23.
- XIAO ESP32S3: `../../references/xiao-esp32s3-model/XIAO-ESP32S3 v2.step`, manufacturer model dated 2023-05-27.
- Manufacturer Wio model: https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step
- Manufacturer XIAO model archive: https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip

`render_native.py` imports the STEP geometry through OpenCascade. HLRBRep removes hidden lines. Triangulated geometry is projected and united into an opaque white silhouette, then true visible CAD edges are placed above it. `inspect_native.py` lists the named manufacturer parts and their original bounding boxes. `measure_features.py` reads cylindrical feature axes for precise hole and antenna locations.

## Supplemental geometry

The supplied XIAO model omits the board-to-board socket. A simplified socket is added at the XY center of the mating Wio connector. Its 0.95 mm height and inner recess are illustrative, not a measured manufacturing definition.

Two seven-pin header rows are added under XIAO to represent the already installed pins requested for the physical demonstration. Pin centers follow the exact model hole axes. Header body depth and exposed pin length are illustrative. The manual does not ask users to solder these headers.

The supplied Wio model omits its user pushbutton. A simplified pushbutton is added at the location shown in the hardware reference image. This is separate from the original manufacturer's CAD.

The assembled stack uses a nominal Wio PCB underside height of 5.0 mm above the XIAO PCB underside. This communicates the mating relationship and provides clearance for the original geometry. It is not a verified connector stack-height measurement or an enclosure design datum. The exploded rendering uses 17 mm separation for instructional clarity.

The two STEP models contain no antenna cables or antenna sheets. Those are authored separately by the presentation composition.

## Coordinate system and measurements

All lengths are in millimeters. X runs across the board. Y runs from the USB/front end toward the rear antenna edge. Z points upward. Wio is mounted above XIAO without an in-plane rotation in this normalized coordinate system.

- XIAO PCB: 17.780 mm wide, 20.955 mm long, 1.250 mm thick.
- Wio PCB: 17.780 mm wide, 21.440 mm long, 1.600 mm thick.
- Both side-hole rows: X = 1.270 and 16.510. Seven holes each at Y = 2.921 + 2.540 n, n = 0 through 6.
- The holes align without a Y translation. Wio projects approximately 0.485 mm farther toward the rear than XIAO.
- XIAO antenna socket axis: X = 13.6167, Y = 19.2334. The receptacle opening plane is Z = 2.500.
- Wio antenna socket axis: X = 5.3984, Y = 19.4793. The receptacle opening plane is Z = 2.900, below the shield top at Z = 3.800.
- The antenna connectors therefore occupy the same rear end of the assembly, on opposite sides.
- Wio mating connector XY bounds: X = 2.4307 through 11.0313, Y = 17.6884 through 21.1228. Its nominal center is X = 6.7310, Y = 19.4056.

Projection screen horizontal coordinate: `u = 0.8660254038 X - 0.5 Y`.

Projection screen vertical coordinate: `v = -0.3535533906 X - 0.6123724357 Y - 0.7071067812 Z`.

This puts the USB/front end toward the lower right. All SVGs use 22 drawing pixels per projected millimeter, with tight independent viewBoxes. Each JSON records the bounds and exact landmark positions in its own SVG coordinates. The PNGs are transparent rasterizations of the SVGs at 192 DPI.

## Deliverables

`assets.json` indexes the diagrams. Individual `{name}.json` files have matching metadata. The final diagrams are `{name}.svg` and `{name}.png`:

- `xiao-iso`, `xiao-top`, `xiao-bottom`
- `wio-iso`, `wio-top`, `wio-bottom`
- `stack-iso`, `exploded-iso`

The SVG paths are scalable. Each board silhouette has a solid near-white fill so one diagram can occlude another in a composed layout. The merged stack has hidden-line removal applied to both boards together.

## Rebuild

The temporary virtual environment used for this export was removed after validation to recover disk space. The source STEP files and all authoring scripts remain.

```sh
python3 -m venv .venv
.venv/bin/pip install 'cadquery-ocp==7.9.3.1.1' shapely
.venv/bin/python render_native.py
NODE_PATH=/path/to/node_modules node render_png.cjs
```

Run these commands from this `cad` directory. The Node modules directory must contain `sharp`. The CAD renderer reads the existing source models two directories above. It rewrites the matching SVG and JSON files deterministically. `render_png.cjs` writes transparent PNGs from those SVGs.
