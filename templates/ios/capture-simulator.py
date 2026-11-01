"""{{name}}'s App Store screens, captured on the iOS simulator.

`npx screenshot-studio recapture --boot` builds the app for the simulator (studio.json → capture), boots each
profile's simulator (profiles.json "simulator"), runs this tour in every language, and exports. The simulator
plumbing (9:41 status bar, appearance, language, screenshots) is the studio's ios.py.

simctl can't tap, so the app takes you to each screen itself: its debug or capture build reads a launch argument
(`-screenshotScene settings` → UserDefaults.standard.string(forKey: "screenshotScene")) or a deep link, and
fills itself with fictional sample data. See docs/capture.md, "iOS".
"""
from ios import Simulator, parser  # the studio's, on PYTHONPATH when recapture runs this tour

args = parser(__doc__).parse_args()
with Simulator(args, '{{package}}') as s:
    for profile in s.profiles():
        s.appearance('light')
        s.launch(screenshotScene='home')
        s.shot('01-hero')
        s.launch(screenshotScene='settings')    # or: s.open_url('{{scheme}}://settings')
        s.shot('02-second')
