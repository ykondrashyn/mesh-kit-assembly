// Source coordinates are the existing Blender exports, not new artwork.
export function presentationForStage(width, height) {
  return width > 600 && height <= 500 ? 'compact' : width <= 600 ? 'phone' : 'full';
}

export function frameCrop(orientation, layout) {
  if (orientation === 'portrait') return { x: 0, y: 0, width: 1080, height: layout === 'phone' ? 1752 : 1920 };
  if (layout === 'compact') return { x: 0, y: 190, width: 1920, height: 720 };
  return { x: 0, y: 0, width: 1920, height: layout === 'phone' ? 920 : 1080 };
}

export const chapterCopy = {
  parts: { title: '01 Check the parts', instruction: 'Two boards. Two antennas.' },
  wifi: { title: '02 Connect Wi-Fi', instruction: 'Align the Wi-Fi plug with XIAO. Press straight down.' },
  lora: { title: '03 Connect LoRa', instruction: 'Align the LoRa plug with Wio. Press straight down.' },
  boards: { title: '04 Join the boards', instruction: 'Align the rear connector. Press straight down.' },
  assembled: { title: 'Assembled', instruction: 'Both antennas connected. Boards joined.' },
};

export function connectorAtFrame(index) {
  if (index >= 87 && index <= 143) return { id: 'wifi', label: 'Wi-Fi antenna connector' };
  if (index >= 159 && index <= 248) return { id: 'lora', label: 'LoRa antenna connector' };
  if (index >= 315 && index <= 368) return { id: 'boards', label: 'Board connector' };
  return null;
}

export function connectorCircle(orientation) {
  return orientation === 'portrait' ? { x: 540, y: 1390, r: 300 } : { x: 1570, y: 515, r: 252 };
}
