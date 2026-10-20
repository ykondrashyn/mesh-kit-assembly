MESH KIT ASSEMBLY

Interactive assembly guide for XIAO ESP32S3 and Wio-SX1262.

Website: https://ykondrashyn.github.io/mesh-kit-assembly/
Repository: https://github.com/ykondrashyn/mesh-kit-assembly

Scroll to connect the Wi-Fi and LoRa antennas and join the boards.
The website includes landscape and portrait artwork, connector close-ups,
reduced-motion chapter stills and readable assembly instructions.
All assembly artwork was rendered in Blender, with no AI-generated imagery.

The repository preserves the manual's original source, models, renders,
video and presentation assets together with the website and its tests.
See assembly-scroll-site/README.txt for development and validation details.

LOCAL PREVIEW

  cd assembly-scroll-site
  python3 scripts/preview.py

Open http://127.0.0.1:8766/.

GITHUB PAGES

The Publish assembly website workflow deploys only assembly-scroll-site/dist.
It checks the timeline and loader tests and verifies all 2,526 exported
frame hashes before publishing. The rest of this repository is available
on GitHub but is not included in the website deployment.

Relevant changes pushed to main deploy automatically. The workflow can
also be run manually from the Actions tab. No custom domain is configured.

The initial commit captures the manual before the website improvements.
The following commits separate responsive assets, loading improvements,
fallback behavior and validation.
