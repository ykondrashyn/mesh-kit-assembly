"""Assembly timing with a two-second reading hold after the opening reveal."""
FPS = 30
BASE_FRAME_COUNT = 450
HOLD_FRAME = 34
READ_HOLD_FRAMES = 60
FRAME_COUNT = BASE_FRAME_COUNT + READ_HOLD_FRAMES
DURATION_SECONDS = FRAME_COUNT / FPS


def source_frame(frame):
    if frame <= HOLD_FRAME:
        return frame
    if frame <= HOLD_FRAME + READ_HOLD_FRAMES:
        return HOLD_FRAME
    return frame - READ_HOLD_FRAMES


def output_frame(frame):
    return frame if frame <= HOLD_FRAME else frame + READ_HOLD_FRAMES
