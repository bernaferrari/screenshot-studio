"""Drive an iOS simulator for store screenshots (Python 3, Xcode's `xcrun simctl`; Pillow for re-encoding).

An app's iOS tour (store-listing/capture-simulator.py) keeps only its scenes:

    # `npx screenshot-studio recapture` runs this with the studio's capture module on PYTHONPATH.
    from ios import Simulator, parser

    args = parser(__doc__).parse_args()
    with Simulator(args, 'com.example.app') as s:
        for profile in s.profiles():              # iphone, ipad… from profiles.json ("platform": "ios")
            s.appearance('light')
            s.launch('-screenshotScene', 'home')  # in the locale's language
            s.shot('01-home')                     # <locale>/raw/<profile>/01-home.png
            s.open_url('myapp://settings')        # or relaunch with another scene
            s.shot('02-settings')

Each profile names its simulator in profiles.json ("simulator": "iPhone 17 Pro Max"); `--simulator` (or studio.json
capture.simulator) is the default. A name matches an available device (a booted one first, then the newest
runtime); a UDID works too. `Simulator` boots what isn't running (and shuts it down again on exit), and while it is
open sets the status bar to 9:41 with full battery, Wi-Fi and signal, and the text size to the default ("large").
On exit it clears the status bar and puts the appearance and text size back, even after a failure.

Navigation: iOS has no uiautomator. simctl can't tap, so a tour reaches its screens through the app itself: launch
arguments its capture or debug build reads (`-screenshotScene settings` arrives as UserDefaults
`screenshotScene`, or in ProcessInfo.arguments) and deep links (`open_url`). Keep that code in a debug-only path.

Languages: `launch` passes `-AppleLanguages (de-DE) -AppleLocale de_DE`, which overrides the language for that launch
only; the simulator's own language stays as it is. A deep link opened after launch reaches the running app, so it
keeps the language.

Command line:  python3 ios.py boot|reset|shutdown --simulator NAME   |   python3 ios.py install App.app --simulator NAME
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

def find_listing():
    """The app's store-listing folder: SCREENSHOT_STUDIO_LISTING (recapture sets it), the folder of the tour being
    run (tours live in store-listing/), or the nearest store-listing/ at or above the working directory."""
    if os.environ.get('SCREENSHOT_STUDIO_LISTING'):
        return Path(os.environ['SCREENSHOT_STUDIO_LISTING']).resolve()
    script = Path(sys.argv[0]).resolve().parent if sys.argv and sys.argv[0] else None
    if script and (script / 'studio.json').exists():
        return script
    for folder in [Path.cwd(), *Path.cwd().parents]:
        for candidate in (folder, folder / 'store-listing'):
            if (candidate / 'studio.json').exists():
                return candidate
    return None


# Found once, when a tour needs it: commands like `reset` run without an app.
LISTING = None
SIMULATOR = os.environ.get('CAPTURE_SIMULATOR')
# 9:41 on 9 January (an iPad shows the date too; the weekday is the simulator's own). simctl reads an ISO time as UTC and shows it in the simulator's
# time zone, which is the Mac's, so 9:41 local is converted; it shows as 9:41 or 09:41 as the simulator's region formats it.
_LOCAL = datetime.datetime(2007, 1, 9, 9, 41).astimezone()
TIME = _LOCAL.astimezone(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
STATUS_BAR = ['--time', TIME, '--batteryState', 'charged', '--batteryLevel', '100', '--cellularMode', 'active',
              '--cellularBars', '4', '--wifiMode', 'active', '--wifiBars', '3', '--dataNetwork', 'wifi', '--operatorName', '']
UDID = re.compile(r'[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}', re.I)
# Play-style locales whose iOS language differs from the plain tag.
LANGUAGES = {'zh-CN': 'zh-Hans', 'zh-SG': 'zh-Hans', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-HK', 'iw-IL': 'he', 'in-ID': 'id'}


def simctl(*words, check=True, timeout=300):
    """Run `xcrun simctl` and return stdout as text."""
    try:
        run = subprocess.run(['xcrun', 'simctl', *map(str, words)], capture_output=True, timeout=timeout)
    except FileNotFoundError:
        raise SystemExit('xcrun not found: iOS capture needs Xcode (xcode-select --install is not enough).')
    if check and run.returncode != 0:
        raise RuntimeError(f"simctl {' '.join(map(str, words))} failed: {(run.stdout + run.stderr).decode(errors='replace').strip()}")
    return run.stdout.decode(errors='replace')


def devices():
    """Every available simulator: {'name', 'udid', 'state', 'runtime'}, newest runtime first."""
    found = []
    for runtime, entries in json.loads(simctl('list', 'devices', 'available', '--json'))['devices'].items():
        version = tuple(int(n) for n in re.findall(r'\d+', runtime.rsplit('.', 1)[-1]))
        found += [{**entry, 'runtime': runtime, 'version': version} for entry in entries]
    return sorted(found, key=lambda d: d['version'], reverse=True)


def find(name):
    """The simulator a name or UDID means: booted ones first, then the newest runtime."""
    if not name:
        raise SystemExit('No simulator: set "simulator" on the profile in profiles.json, capture.simulator in '
                         'studio.json, or pass --simulator "iPhone 17 Pro Max".')
    available = devices()
    matches = [d for d in available if d['udid'].lower() == name.lower()] or [d for d in available if d['name'] == name]
    if not matches:
        names = sorted({d['name'] for d in available})
        raise SystemExit(f'No available simulator named {name!r}. Available: {", ".join(names) or "none (install a runtime in Xcode)"}')
    return next((d for d in matches if d['state'] == 'Booted'), matches[0])


def boot(name, log=print):
    """Boot a simulator (no window) and wait until it has finished booting; returns (udid, whether we booted it)."""
    device = find(name)
    if device['state'] == 'Booted':
        return device['udid'], False
    log(f"Booting {device['name']} ({device['runtime'].rsplit('.', 1)[-1]}, {device['udid']})…")
    simctl('bootstatus', device['udid'], '-b', timeout=600)
    return device['udid'], True


def parser(description=None, profiles=True):
    """The arguments every iOS capture script takes; add the app's own before parse_args()."""
    p = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--simulator', default=SIMULATOR, help='Simulator name or UDID for profiles that name none')
    if profiles:
        p.add_argument('--profile', default='all', help='Capture one profile from profiles.json (default: all iOS ones)')
    p.add_argument('--locale', help='Locale to capture in, e.g. de-DE (default: the studio default locale)')
    p.add_argument('--only', help='Comma-separated scene names to capture (default: all)')
    p.add_argument('--keep', action='store_true', help="Leave simulators this run boots running")
    return p


def apple_language(locale):
    """A store locale (de-DE) as iOS launch arguments' language and region: ('de-DE', 'de_DE')."""
    language = LANGUAGES.get(locale, locale)
    parts = locale.split('-')
    region = next((p for p in parts[1:] if re.fullmatch(r'[A-Z]{2}|\d{3}', p)), None)
    return language, f'{parts[0]}_{region}' if region else parts[0]


class Simulator:
    def __init__(self, args, bundle, *, app=None, locale=True, content_size='large', listing=None):
        """args: parsed `parser()` arguments. bundle: the app's bundle identifier. app: an .app to install on each
        simulator first. locale: launch in the --locale language (False leaves the simulator's). content_size: the
        text size while capturing (None leaves it)."""
        listing = listing or LISTING or find_listing()
        if not listing:
            raise SystemExit('No store-listing/studio.json found. Run the tour from the app, or through `npx screenshot-studio recapture`.')
        self.listing = Path(listing)
        config = self.listing / 'studio.json'
        self.studio = json.loads(config.read_text()) if config.exists() else {}
        self.reference = self.studio.get('defaultLocale', 'en-US')
        self.locale = getattr(args, 'locale', None) or self.reference
        if not re.fullmatch(r'[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*', self.locale):
            raise SystemExit(f'Invalid locale {self.locale}')
        self.raw = self.listing / self.locale / 'raw'
        self.bundle, self.app, self.app_locale, self.content_size = bundle, app, locale, content_size
        self.default = getattr(args, 'simulator', None) or (self.studio.get('capture') or {}).get('simulator') or SIMULATOR
        only = getattr(args, 'only', None)
        self.only = set(only.split(',')) if only else None
        self.selected = getattr(args, 'profile', None)
        self.keep = getattr(args, 'keep', False)
        self.udid = None
        self.profile = self.theme = None
        self.width = self.height = 0
        self.prepared = {}  # udid -> what to put back on exit
        self.booted = []

    # lifecycle ----------------------------------------------------------------------------------------
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        for udid, saved in self.prepared.items():
            steps = [lambda u=udid: simctl('terminate', u, self.bundle, check=False),
                     lambda u=udid: simctl('status_bar', u, 'clear', check=False)]
            if saved.get('appearance') in ('light', 'dark'):
                steps.append(lambda u=udid, v=saved['appearance']: simctl('ui', u, 'appearance', v, check=False))
            if saved.get('content_size') and saved['content_size'] not in ('unknown', 'unsupported'):
                steps.append(lambda u=udid, v=saved['content_size']: simctl('ui', u, 'content_size', v, check=False))
            if udid in self.booted and not self.keep:
                steps.append(lambda u=udid: simctl('shutdown', u, check=False))
            for step in steps:
                try:
                    step()
                except Exception as error:  # keep restoring; report what could not be put back
                    print(f'cleanup: {error}', file=sys.stderr)
        return False

    def use(self, profile, simulator, width=None, height=None):
        """Switch to a simulator (booting and preparing it once) for this profile's captures."""
        udid, booted = boot(simulator)
        if booted:
            self.booted.append(udid)
        self.udid, self.profile = udid, profile
        self.width, self.height = width or 0, height or 0
        if udid not in self.prepared:
            self.prepared[udid] = {'appearance': simctl('ui', udid, 'appearance', check=False).strip(),
                                   'content_size': simctl('ui', udid, 'content_size', check=False).strip()}
            if self.app:
                self.install(self.app)
            if self.content_size:
                simctl('ui', udid, 'content_size', self.content_size, check=False)
            self.status_bar()
        return udid

    def profiles(self, only=None):
        """Yield each iOS capture profile's name (profiles.json entries with "platform": "ios" and a capture size)
        after switching to its simulator. only: names to keep (default: --profile)."""
        only = only or ([] if self.selected in (None, 'all') else self.selected.split(','))
        config = json.loads((self.listing / 'profiles.json').read_text())
        unknown = set(only) - set(config)
        if unknown:
            raise SystemExit(f'No profile {", ".join(sorted(unknown))} in profiles.json')
        for name, p in config.items():
            if not isinstance(p, dict) or p.get('platform') != 'ios' or 'captureWidth' not in p or (only and name not in only):
                continue
            self.use(name, p.get('simulator') or self.default, p['captureWidth'], p['captureHeight'])
            yield name

    # system state -------------------------------------------------------------------------------------
    def status_bar(self):
        """9:41, full battery, Wi-Fi and signal, no carrier name."""
        simctl('status_bar', self.udid, 'override', *STATUS_BAR)

    def appearance(self, mode, settle=1.5):
        """'light' or 'dark' (night(on) is the same, for tours written for capture.py)."""
        simctl('ui', self.udid, 'appearance', mode)
        self.theme = mode
        time.sleep(settle)

    def night(self, on, settle=1.5):
        self.appearance('dark' if on else 'light', settle)

    # app ----------------------------------------------------------------------------------------------
    def install(self, app):
        if not Path(app).is_dir():
            raise SystemExit(f'No .app at {app}: build it for the simulator first (studio.json capture.build)')
        simctl('install', self.udid, app)

    def launch(self, *arguments, bundle=None, wait=3, **defaults):
        """Terminate and start the app with launch arguments, in the capture language. Keyword arguments become
        `-key value` pairs, which the app reads with UserDefaults (`screenshotScene='settings'`)."""
        bundle = bundle or self.bundle
        words = [str(a) for a in arguments]
        for key, value in defaults.items():
            words += [f'-{key}', ('YES' if value else 'NO') if isinstance(value, bool) else str(value)]
        if self.app_locale:
            language, region = apple_language(self.locale)
            words += ['-AppleLanguages', f'({language})', '-AppleLocale', region]
        simctl('launch', '--terminate-running-process', self.udid, bundle, *words)
        time.sleep(wait)

    def terminate(self, bundle=None):
        simctl('terminate', self.udid, bundle or self.bundle, check=False)

    def open_url(self, url, wait=2):
        """Open a deep link (the app's own scheme reaches the running app)."""
        simctl('openurl', self.udid, url)
        time.sleep(wait)

    def privacy(self, action, service, bundle=None):
        """Grant or revoke a permission up front, so no system alert covers a scene: privacy('grant', 'photos')."""
        simctl('privacy', self.udid, action, service, bundle or self.bundle)

    # captures -----------------------------------------------------------------------------------------
    def screencap(self):
        """The display as PNG bytes, with square corners (the frame rounds them)."""
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / 'shot.png'
            simctl('io', self.udid, 'screenshot', '--type=png', '--mask=ignored', file)
            return file.read_bytes()

    def target(self, name):
        if isinstance(name, Path):
            return name
        if '/' in name or '.' in name:
            return self.raw / name
        return self.raw / self.profile / f'{name}.png'

    def shot(self, *names, settle=1.2):
        """Capture the screen to each target and return their paths. A plain name is
        <locale>/raw/<profile>/<name>.png; a relative path with a folder or extension sits under
        <locale>/raw; a Path is used as is. Skipped (returns []) when --only does not list the first name."""
        paths = [self.target(name) for name in names]
        if self.only and paths[0].stem not in self.only:
            return []
        time.sleep(settle)
        png = self.screencap()
        size = int.from_bytes(png[16:20], 'big'), int.from_bytes(png[20:24], 'big')
        if self.width and size not in ((self.width, self.height), (self.height, self.width)):
            raise AssertionError(f'{self.profile}/{paths[0].name}: got {size[0]}x{size[1]}, expected {self.width}x{self.height} '
                                 f'(pick a simulator with that screen in profiles.json)')
        from io import BytesIO
        from PIL import Image
        image = Image.open(BytesIO(png)).convert('RGB')  # App Store Connect refuses alpha
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.suffix.lower() in ('.jpg', '.jpeg'):
                image.save(path, quality=95, subsampling=0)
            else:
                image.save(path, optimize=True)
            print(path.relative_to(self.listing.parent) if path.resolve().is_relative_to(self.listing.parent.resolve()) else path, flush=True)
        return paths


def main():
    p = argparse.ArgumentParser(description='Simulator chores outside a capture run.')
    p.add_argument('command', choices=['boot', 'install', 'reset', 'shutdown'])
    p.add_argument('app', nargs='?', help='The .app to install')
    p.add_argument('--simulator', default=SIMULATOR, required=not SIMULATOR)
    p.add_argument('--package', help='Bundle identifier (informational)')
    args = p.parse_args()
    if args.command == 'boot':
        udid, _ = boot(args.simulator)
        print(f'{args.simulator} is booted ({udid})')
        return
    device = find(args.simulator)
    if args.command == 'shutdown':
        simctl('shutdown', device['udid'], check=False)
        print(f'{args.simulator} is shut down')
    elif args.command == 'install':
        if not args.app:
            p.error('install needs the path to an .app')
        udid, _ = boot(args.simulator)
        if not Path(args.app).is_dir():
            raise SystemExit(f'No .app at {args.app}')
        simctl('install', udid, args.app)
        print(f'Installed {args.package or args.app} on {args.simulator}')
    elif device['state'] == 'Booted':  # an interrupted run can leave the status bar, dark mode or a text size
        simctl('status_bar', device['udid'], 'clear', check=False)
        simctl('ui', device['udid'], 'appearance', 'light', check=False)
        simctl('ui', device['udid'], 'content_size', 'large', check=False)
        print(f'{args.simulator} reset')


if __name__ == '__main__':
    main()
