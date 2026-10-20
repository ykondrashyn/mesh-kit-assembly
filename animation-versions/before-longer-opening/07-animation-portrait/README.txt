MESH KIT: PORTRAIT ASSEMBLY SHOWCASE

assembly-showcase.mp4
  1080 x 1920, 9:16, 30 fps, 15 seconds
  H.264 video in an MP4 container, YUV420p, no audio
  White background, playback ends on the assembled kit

assembly-showcase-poster.png
  Full-resolution final assembled view, suitable as the video's poster
  or as a separate still image on a slide.

POWERPOINT

Insert assembly-showcase.mp4 as a video from your computer.
Keep its 9:16 aspect ratio when resizing. Choose playback on click or
automatically, according to how you want to present the slide.
Leave looping and rewind-after-playing disabled to retain the final view.
Use assembly-showcase-poster.png if you want the assembled kit to appear
before playback. The clip is silent so you can explain the sequence live.

PORTRAIT LAYOUT

The main assembly sits above a 600-pixel circular connector close-up.
Captions wrap to fit the narrow frame. The landscape version remains
available in ../06-animation. For a full-slide portrait presentation,
set the slide size to 9:16 before inserting the video.

SEQUENCE

  0.0-1.1 s    Ordered lineup: LoRa antenna, Wio, Wi-Fi antenna, XIAO
  1.1-2.6 s    Parts glide into position, with a curved path for XIAO
  1.5-5.0 s    Connect Wi-Fi to XIAO, with a circular connector close-up
  5.0-8.5 s    Connect LoRa to Wio, with a circular connector close-up
  8.5-12.5 s   Orbit 180 degrees to the rear, align and seat the board connector
 12.5-14.0 s   Rotate back to the front of the completed assembly
 14.0-15.0 s   Hold the final front view still

EDITABLE SOURCE

Open _source/assembly-showcase.blend in Blender.
The timeline contains 450 frames and named step markers. The project opens
on the final assembly. All motion is baked into ordinary editable keyframes,
including cable points, camera movement, circular close-ups and tracking
leaders. Playback does not depend on Python handlers or external images.

The project contains the complete official XIAO and Wio board geometry,
representative manufacturer RF plug models and native Blender additions.
The opening labels identify LoRa antenna / 868 MHz, Wio-SX1262,
Wi-Fi antenna / 2.4 GHz and XIAO ESP32S3 in regular Arial.
These opening labels fade in one by one, 0.2 seconds apart in lineup order.
Step 2 zooms into the Wi-Fi antenna and XIAO only. Step 3 zooms into
the LoRa antenna and Wio only. The inactive pair fades out, then both
return for board stacking. Each active pair keeps its circular detail.
Step titles and circular details fade between scenes. Camera transitions
use gentler acceleration and deceleration.

The opening uses a vertical lineup with a gentle push-in.
The antennas begin with their plugs detached. Each part has an editable
motion control, including the curved transition path for XIAO.
The camera moves around the assembly using an orthographic projection to
preserve the visual language of the original assembly guide.
During stacking, the camera turns 180 degrees to expose the rear connector.
The circular detail uses the same rear orientation and follows the connector
separation. A tracking ring encloses both mating halves in the main view.
After seating, the camera turns back to the front while pulling back slightly.
The final second holds this front view still.

REBUILD OR RENDER

Requires Blender 5.2.1 or a compatible newer version, Python 3 and FFmpeg
with libx264. Commands can be run from this directory:

  python3 _source/make_video.py

To rebuild the scene from the included geometry and scripts first:

  python3 _source/make_video.py --rebuild

To encode an already rendered sequence:

  python3 _source/make_video.py --skip-render

To check the animation's geometric and layout constraints:

  blender --background _source/assembly-showcase.blend --python _source/validate_animation.py

To check portrait text margins, callout routing and matching assembly motion:

  blender --background _source/assembly-showcase.blend --python _source/validate_portrait_layout.py

To refresh the complete asset ZIP after validating both variants:

  python3 _source/finalize_package.py

To check the opening order and board-to-antenna clearance during deployment:

  blender --background _source/assembly-showcase.blend --python _source/validate_opening.py

To check the opening labels and step fades:

  blender --background _source/assembly-showcase.blend --python _source/validate_transitions.py

Source geometry and fonts are included under _source/geometry-data.
The ZIP excludes intermediate PNG frame sequences, previews, logs and
Blender backup files. Rendering recreates the frames locally.

MODEL NOTES

The antenna films are labelled Wi-Fi / 2.4 GHz and LoRa / 868 MHz.
These are editable native Blender text objects using the same regular
Arial font and ink material as the chip labels.

Wi-Fi uses the representative I-PEX MHF I 1.13 mm plug with its 13 stamp.
LoRa uses the representative 1.37 mm plug with its 37 stamp and separate
C M artwork matching the user's observation. The exact kit supplier and
the meaning of C M remain unverified.

The XIAO mating socket is simplified, as labelled in the animation.
The nominal 5 mm joined board spacing, antenna films, cable bends and
supplemental components are instructional geometry. The animation is an
assembly illustration, not a mechanical fit or cable-length simulation.

No AI-generated imagery is used. Blender generates all visible pixels.
FFmpeg encodes the Blender PNG frames. The original manual remains unchanged. The PowerPoint PNG assets and
both animation formats include Wi-Fi / 2.4 GHz and LoRa / 868 MHz labels.

Official board sources:
https://files.seeedstudio.com/wiki/SeeedStudio-XIAO-ESP32S3/res/seeed-studio-xiao-esp32s3-3d_model.zip
https://files.seeedstudio.com/products/SenseCAP/Wio_SX1262/Wio-SX1262_for_XIAO_3D_file.step

Representative RF plug source:
https://www.i-pex.com/product/mhf-I
