"""The emulator itself, for `Device`: adb, settings, and the system state a capture sets (demo mode, display size,
night mode, animations, clock, rotation) or clears (helper packages, notifications)."""
import os
import re
import subprocess
import sys
import time

SERIAL = os.environ.get('CAPTURE_SERIAL', 'emulator-5578')
DEMO = 'com.android.systemui.demo'
SCALES = ('animator_duration_scale', 'transition_animation_scale', 'window_animation_scale')
# Installed by tools or Google Play services rather than by a person; they would show up in app lists.
HELPERS = re.compile(r'^com\.callstack\.agentdevice\..*|.*\.safetycore|.*contactkeys.*|.*\.verifier$')


class Emulator:
    """Needs self.serial and self.package; resize sets self.width, height and density."""

    # adb ----------------------------------------------------------------------------------------------
    def adb(self, *words, check=True, timeout=300, retries=2):
        """Run adb against this emulator and return stdout as text. A starved emulator sometimes drops a
        command, so a failure is tried again before it raises."""
        for attempt in range(retries + 1):
            run = subprocess.run(['adb', '-s', self.serial, *map(str, words)], capture_output=True, timeout=timeout)
            if run.returncode == 0 or not check:
                return run.stdout.decode(errors='replace') + run.stderr.decode(errors='replace') * (not check)
            if attempt == retries:
                raise RuntimeError(f"adb {' '.join(map(str, words))} failed: {(run.stdout + run.stderr).decode(errors='replace').strip()}")
            time.sleep(3)

    def shell(self, *words, check=True, **kw):
        return self.adb('shell', *words, check=check, **kw)

    def _uitree_adb(self, *words):  # uitree helpers take a function of adb words
        return self.adb(*words)

    def setting(self, namespace, key, value=None):
        if value is None:
            value = self.shell('settings', 'get', namespace, key).strip()
            return None if value in ('', 'null') else value
        self.shell('settings', 'put', namespace, key, value)

    # system state -------------------------------------------------------------------------------------
    def hide_helpers(self):
        """Remove tool and Play-services helper packages for the current user (pm install-existing restores)."""
        self.free_uiautomation()
        for line in self.shell('pm', 'list', 'packages').split():
            name = line.removeprefix('package:')
            if HELPERS.fullmatch(name):
                self.shell('pm', 'uninstall', '--user', '0', name, check=False)

    def free_uiautomation(self):
        """Stop a client that still holds UiAutomation (agent-device's snapshothelper app_process, an old dump)."""
        for line in self.shell('ps', '-A', '-o', 'PID,ARGS', check=False).splitlines()[1:]:
            pid, _, command = line.strip().partition(' ')
            if 'snapshothelper' in command or 'uiautomator' in command:
                self.shell('kill', pid, check=False)
        self.shell('am', 'force-stop', 'com.callstack.agentdevice.snapshothelper', check=False)

    def snooze_notifications(self):
        """Snooze other apps' notifications for a week, so none reach the status bar or shade."""
        for key in self.shell('cmd', 'notification', 'list', check=False).split():
            if key.count('|') >= 2 and f'|{self.package}|' not in key:
                self.shell(f"cmd notification snooze --for 604800000 '{key}'", check=False)

    def install(self, apk, package=None):
        """Install an APK; on INSUFFICIENT_STORAGE uninstall the package (the capture build) and trim caches, then retry."""
        package = package or self.package
        for attempt in range(3):
            out = self.adb('install', '-r', '-t', str(apk), check=False, retries=0)
            if 'Success' in out:
                return
            if 'INSUFFICIENT_STORAGE' in out and attempt == 0:
                print(f'Low storage: reinstalling {package} from scratch', file=sys.stderr)
                self.adb('uninstall', package, check=False, retries=0)
            elif 'INSUFFICIENT_STORAGE' in out and attempt == 1:
                self.shell('pm', 'trim-caches', '64G', check=False)
            elif 'UPDATE_INCOMPATIBLE' in out and attempt == 0:  # signed by another machine's debug key
                self.adb('uninstall', package, check=False, retries=0)
            else:
                raise RuntimeError(f'Install of {apk} failed: {out.strip()}')
        raise RuntimeError(f'Install of {apk} failed: {out.strip()}')

    def demo(self, command, **extras):
        words = ['am', 'broadcast', '-a', DEMO, '--es', 'command', command]
        for key, value in extras.items():
            words += ['--es', key, str(value)]
        self.shell(*words, check=False)

    def status_bar(self):
        """Demo mode: 9:41, battery, full Wi-Fi, no mobile signal, SIM, airplane icon or notifications."""
        self.demo('exit')
        self.demo('enter')
        self.demo('clock', hhmm='0941')
        self.demo('battery', level=self.battery, plugged='false')
        self.demo('notifications', visible='false')
        self.demo('network', wifi='show', level=4, fully='true', mobile='hide', sims=0, airplane='hide')

    def resize(self, width, height, density, settle=2):
        self.demo('exit')
        self.shell('wm', 'size', f'{width}x{height}')
        self.shell('wm', 'density', density)
        self.width, self.height, self.density = width, height, density
        time.sleep(settle)
        self.status_bar()

    def night(self, on, settle=2):
        self.shell('cmd', 'uimode', 'night', 'yes' if on else 'no')
        self.theme = 'dark' if on else 'light'
        time.sleep(settle)

    def animations(self, on):
        for key in SCALES:
            self.setting('global', key, '1' if on else '0')

    def set_clock(self, hhmm='09:41'):
        """Set the emulator's clock to today at hhmm (matching the status bar); the host time comes back on exit."""
        import datetime
        hour, minute = map(int, hhmm.split(':'))
        moment = datetime.datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
        self.clock_set = True
        self.setting('global', 'auto_time', '0')
        self.shell('cmd', 'alarm', 'set-time', str(int(moment.timestamp() * 1000)))

    def rotate(self, landscape, settle=4):
        self.setting('system', 'accelerometer_rotation', '0')
        self.setting('system', 'user_rotation', '1' if landscape else '0')
        time.sleep(settle)
