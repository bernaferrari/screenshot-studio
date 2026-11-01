"""Drive the capture emulator for store screenshots (Python 3; Pillow for JPEG output and re-encoding).

An app's capture script keeps only its scene tour:

    # `npx screenshot-studio recapture` runs this with the studio's capture module on PYTHONPATH.
    from capture import Device, parser

    args = parser(__doc__).parse_args()
    with Device(args, 'com.example.storecapture', '.MainActivity') as d:
        for profile in d.profiles():
            d.night(False)
            d.launch(clear=True)
            d.shot('01-home')                 # <locale>/raw/<profile>/01-home.png + .nodes.json
            d.tap('Settings')
            d.shot('02-settings')

`Device` refuses anything but an emulator serial and an emulator that still has a display-size override.
While it is open it sets gesture navigation, System UI demo mode (9:41, full battery and Wi-Fi, no
notifications or SIM), font scale 1, heads-up off, the network off (`offline`), animations off
(`animations=False`; otherwise
they are set to 1, whatever an interrupted run left), and the app's language; each profile gets its `wm size`/`wm density` from
profiles.json. Everything it changes is put back on exit, even after a failure.

It also recovers from what goes wrong on a busy emulator: a stale UiAutomation client (an agent-device
`snapshothelper` app_process: "UiAutomationService ... already registered"), an "isn't responding"
dialog (it taps Wait), a slow first draw, and INSTALL_FAILED_INSUFFICIENT_STORAGE (it uninstalls the
app's capture build and trims caches, then installs again). Helper packages that would show up in app
lists (agent-device, SafetyCore, contact keys, verifiers) are hidden with `pm uninstall --user 0`.

Taps are by label (a regular expression, matched in full against text or content description). With a
tap map (the default), the reference locale records the UI tree path of each tapped node in
<default locale>/raw/tap-map.json and other locales replay those paths, so a tour written with English
labels runs in every language. `d.scope` (default "<profile>|<theme>") prefixes each tap's key.

Command line:  python3 capture.py install <apk> [--package p]  |  python3 capture.py reset   (or: npx screenshot-studio reset)

This module is what tours import; the work is in its siblings, which the build copies beside it:
    capture_device.py     Device and parser
    capture_emulator.py   adb, settings and system state
    capture_ui.py         the UI tree, taps, keys and gestures
    capture_shot.py       screenshots and their layout sidecars
    capture_tour.py       the listing, locale and profiles (shared with ios.py)
    uitree.py             UI tree parsing, the tap map and per-app languages
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from capture_device import Device, parser  # noqa: E402
from capture_emulator import DEMO, HELPERS, SCALES, SERIAL  # noqa: E402
from capture_shot import PNG, SYSTEM_DIALOG  # noqa: E402
from capture_tour import find_listing  # noqa: E402
from uitree import Navigator, nodes_from_xml, set_app_locale, write_sidecar  # noqa: E402

__all__ = ['Device', 'parser', 'find_listing', 'main', 'SERIAL', 'DEMO', 'SCALES', 'HELPERS', 'PNG', 'SYSTEM_DIALOG',
           'Navigator', 'nodes_from_xml', 'set_app_locale', 'write_sidecar']


def main():
    p = argparse.ArgumentParser(description='Capture-emulator chores outside a capture run.')
    p.add_argument('command', choices=['install', 'reset'])
    p.add_argument('apk', nargs='?')
    p.add_argument('--package', help='Application ID inside the APK (uninstalled first when storage runs out)')
    p.add_argument('--serial', default=SERIAL)
    args = p.parse_args()
    device = Device(argparse.Namespace(serial=args.serial), args.package or '', locale=False, tap_map=None, offline=False)
    if args.command == 'install':
        if not args.apk or not args.package:
            p.error('install needs an APK path and --package')
        device.hide_helpers()
        device.install(args.apk)
        print(f'Installed {args.package}')
    else:  # an interrupted run can leave display overrides, demo mode, dark mode or no animations behind
        device.demo('exit')
        for words in (('wm', 'size', 'reset'), ('wm', 'density', 'reset'), ('cmd', 'uimode', 'night', 'no'),
                      ('svc', 'wifi', 'enable'), ('svc', 'data', 'enable')):
            device.shell(*words, check=False)
        for key in SCALES:
            device.setting('global', key, '1')
        device.setting('global', 'heads_up_notifications_enabled', '1')
        device.setting('global', 'auto_time', '1')
        print(f'{args.serial} reset')


if __name__ == '__main__':
    main()
