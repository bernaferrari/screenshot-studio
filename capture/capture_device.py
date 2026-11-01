"""`Device`, the capture emulator as a tour sees it, and `parser`, the arguments every tour takes."""
import argparse
import sys
import time

from capture_emulator import SCALES, SERIAL, Emulator
from capture_shot import Shots
from capture_tour import Tour
from capture_ui import Screen
from uitree import Navigator, set_app_locale


def parser(description=None, profiles=True):
    """The arguments every capture script takes; add the app's own before parse_args()."""
    p = argparse.ArgumentParser(description=description, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--serial', default=SERIAL, help=f'Dedicated emulator serial (default {SERIAL}); never a physical phone')
    if profiles:
        p.add_argument('--profile', default='all', help='Capture one profile from profiles.json (default: all)')
    p.add_argument('--locale', help='Play locale to capture in, e.g. de-DE (default: the studio default locale)')
    p.add_argument('--only', help='Comma-separated scene names to capture (default: all)')
    return p


class Device(Tour, Emulator, Screen, Shots):
    def __init__(self, args, package, activity=None, *, foreground=None, tap_map='tap-map.json', battery=100,
                 offline=True, animations=True, locale=True, apk=None, uninstall=False, listing=None):
        """args: parsed `parser()` arguments. package: the capture build's application ID; activity its launch
        activity ('.Main' is relative to the package). foreground: the package whose UI must be on screen
        before a dump counts (default `package`). tap_map: file name under <default>/raw (None: plain label
        taps). offline: Wi-Fi and data off while capturing. animations: False turns them off. locale: set the
        app language (False leaves it to the system). apk: install this first; uninstall=True removes the package
        on exit (a test APK that would otherwise show up in other apps' app lists)."""
        self.serial = getattr(args, 'serial', None) or SERIAL
        if not self.serial.startswith('emulator-'):
            raise SystemExit('Use a dedicated emulator, not a personal device.')
        Tour.__init__(self, args, listing)
        self.package = package
        self.activity = activity
        self.foreground = foreground or package
        self.navigator = Navigator(self.listing / self.reference / 'raw' / tap_map,
                                   recording=self.locale == self.reference) if tap_map else None
        self.battery, self.offline, self.keep_animations, self.app_locale, self.apk = battery, offline, animations, locale, apk
        self.uninstall = uninstall
        self.profile = self.theme = None
        self.width = self.height = self.density = 0
        self.scope = None
        self.xml = None
        self.saved = {}
        self.clock_set = False
        self.display = None

    # lifecycle ----------------------------------------------------------------------------------------
    def __enter__(self):
        qemu = self.shell('getprop', 'ro.kernel.qemu').strip() + self.shell('getprop', 'ro.boot.qemu').strip()
        if '1' not in qemu:
            raise SystemExit(f'{self.serial} is not an emulator.')
        overrides = self.shell('wm', 'size') + self.shell('wm', 'density')
        if 'Override' in overrides:
            raise SystemExit('The emulator still has a display override from an interrupted run: '
                             'npx screenshot-studio reset')
        for key in ('heads_up_notifications_enabled', 'auto_time', *SCALES):
            self.saved[('global', key)] = self.setting('global', key)
        for key in ('font_scale', 'accelerometer_rotation', 'user_rotation'):
            self.saved[('system', key)] = self.setting('system', key)
        try:
            self.shell('input', 'keyevent', 'KEYCODE_WAKEUP')
            self.shell('wm', 'dismiss-keyguard', check=False)
            self.shell('cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.gestural')
            self.setting('system', 'font_scale', '1.0')
            self.setting('global', 'sysui_demo_allowed', '1')
            self.setting('global', 'heads_up_notifications_enabled', '0')
            self.hide_helpers()
            self.snooze_notifications()
            if self.offline:
                self.shell('svc', 'wifi', 'disable', check=False)
                self.shell('svc', 'data', 'disable', check=False)
            self.animations(self.keep_animations)  # explicitly: an interrupted run can leave them at 0
            if self.apk:
                self.install(self.apk)
            if self.app_locale:
                set_app_locale(self._uitree_adb, self.package, self.locale)
        except BaseException:
            self.__exit__(*sys.exc_info())
            raise
        return self

    def __exit__(self, *exc):
        if self.navigator:
            try:
                self.navigator.save()
            except Exception as error:
                print(f'cleanup: {error}', file=sys.stderr)
        steps = [lambda: self.shell('am', 'force-stop', self.package, check=False)]
        if self.app_locale:
            steps.append(lambda: set_app_locale(self._uitree_adb, self.package, None))
        steps += [lambda: self.demo('exit'),
                  lambda: self.shell('cmd', 'uimode', 'night', 'no', check=False),
                  lambda: self.shell('wm', 'size', 'reset', check=False),
                  lambda: self.shell('wm', 'density', 'reset', check=False)]
        if self.clock_set:  # back to the host's time
            steps.append(lambda: self.shell('cmd', 'alarm', 'set-time', str(int(time.time() * 1000)), check=False))
        defaults = {'heads_up_notifications_enabled': '1', 'auto_time': '1', 'font_scale': '1.0',
                    'accelerometer_rotation': '1', 'user_rotation': '0', **{key: '1' for key in SCALES}}
        for (namespace, key), value in self.saved.items():
            steps.append(lambda n=namespace, k=key, v=value: self.setting(n, k, v or defaults[k]))
        if self.offline:
            steps += [lambda: self.shell('svc', 'wifi', 'enable', check=False),
                      lambda: self.shell('svc', 'data', 'enable', check=False)]
        if self.uninstall:
            steps.append(lambda: self.adb('uninstall', self.package, check=False, retries=0))
        for step in steps:
            try:
                step()
            except Exception as error:  # keep restoring; report what could not be put back
                print(f'cleanup: {error}', file=sys.stderr)
        return False

    # profiles -----------------------------------------------------------------------------------------
    def use(self, profile, width, height, density):
        """Switch to a capture size by hand (profiles() does this for every profile in profiles.json)."""
        self.profile = profile
        self.resize(width, height, density)

    def profiles(self, only=None):
        """Yield each capture profile's name (profiles.json entries with captureWidth/Height/Density) after
        setting its display size, density and status bar. only: names to keep (default: --profile)."""
        config, only = self.profile_config(only)
        for name, p in config.items():
            if 'captureDensity' not in p or (only and name not in only):
                continue
            self.scope = None
            self.use(name, p['captureWidth'], p['captureHeight'], p['captureDensity'])
            yield name

    # app ----------------------------------------------------------------------------------------------
    def component(self, activity=None):
        activity = activity or self.activity
        if '/' in activity:
            return activity
        return f'{self.package}/{self.package + activity if activity.startswith(".") else activity}'

    def launch(self, activity=None, clear=False, wait=4, **extras):
        """Force-stop and start the app; clear=True wipes its data first (the app language is set again).
        Extras become intent extras (bool --ez, int --ei, otherwise --es)."""
        self.shell('am', 'force-stop', self.package)
        if clear:
            self.shell('pm', 'clear', self.package)
            if self.app_locale:
                set_app_locale(self._uitree_adb, self.package, self.locale)
        words = ['am', 'start', '-W', '-n', self.component(activity)]
        for key, value in extras.items():
            flag = '--ez' if isinstance(value, bool) else '--ei' if isinstance(value, int) else '--es'
            words += [flag, key, str(value).lower() if isinstance(value, bool) else str(value)]
        self.shell(*words)
        time.sleep(wait)

    def app_files(self):
        return self.shell('run-as', self.package, 'ls', 'files', check=False, retries=0)

    def top_activity(self):
        return self.shell('dumpsys', 'activity', 'activities').split('topResumedActivity=', 1)[-1][:200]
