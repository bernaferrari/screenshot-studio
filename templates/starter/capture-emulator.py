"""{{name}}'s store screens, captured on the emulator.

`npx screenshot-studio recapture --boot` builds the capture app (studio.json → capture), boots the emulator,
runs this tour for every device size, and exports. The emulator plumbing is the studio's capture.py.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'studio'))
from capture import Device, parser  # noqa: E402

args = parser(__doc__).parse_args()
with Device(args, '{{package}}.storecapture', '.MainActivity') as d:
    for profile in d.profiles():
        d.night(False)
        d.launch(clear=True)
        d.shot('01-hero')
        d.tap('Settings')          # tap by the text on screen
        d.shot('02-second')
