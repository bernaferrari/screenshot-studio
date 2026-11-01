"""Screenshots, for `Device`: the display as PNG, checked and saved with its layout sidecar."""
import re
import subprocess
import time

from uitree import write_sidecar

PNG = b'\x89PNG\r\n\x1a\n'
SYSTEM_DIALOG = re.compile(r".*(isn't responding|keeps stopping|has stopped).*")


class Shots:
    """Needs self.serial, the listing and raw folders, the screen size and dump()."""

    def screencap(self):
        """The display as PNG bytes (the emulator's second display adds a warning before the PNG header)."""
        if self.display is None:
            ids = re.search(r'Display (\d+) \(HWC display 0\)', self.shell('dumpsys', 'SurfaceFlinger', '--display-id', check=False))
            self.display = ids.group(1) if ids else ''
        run = subprocess.run(['adb', '-s', self.serial, 'exec-out', 'screencap', '-p', *(['-d', self.display] if self.display else [])],
                             capture_output=True, timeout=120, check=True)
        start = run.stdout.find(PNG)
        if start < 0:
            raise RuntimeError(f'screencap returned no PNG: {run.stdout[:200]!r}')
        return run.stdout[start:]

    def shot(self, *names, settle=1.2, animated=False, check=None, either=False):
        """Capture the screen to each target and return their paths. A plain name is
        <locale>/raw/<profile>/<name>.png; a relative path with a folder or extension sits under
        <locale>/raw; a Path is used as is. Files under raw get a .nodes.json layout sidecar.
        animated: read the layout with animations off, then let the real motion run and grab a frame.
        check(nodes) can refuse a screen; either=True accepts the size in either orientation.
        Skipped (returns []) when --only does not list the first name's stem."""
        paths = [self.target(name) for name in names]
        if self.only and paths[0].stem not in self.only:
            return []
        time.sleep(settle)
        nodes = self.dump()
        xml = self.xml
        dialog = next((n for n in nodes if n.get('pkg') == 'android' and SYSTEM_DIALOG.fullmatch(n.get('text', ''))), None)
        if dialog:
            raise AssertionError(f'{self.profile}/{paths[0].name}: a system dialog is on screen: {dialog["text"]}')
        if check and check(nodes) is False:
            raise AssertionError(f'{self.profile}/{paths[0].name}: the screen failed its check')
        if animated:
            self.animations(True)
            time.sleep(4.5)
        try:
            png = self.screencap()
        finally:
            if animated:
                self.animations(False)
        size = int.from_bytes(png[16:20], 'big'), int.from_bytes(png[20:24], 'big')
        expected = {(self.width, self.height)} | ({(self.height, self.width)} if either else set())
        if size not in expected:
            raise AssertionError(f'{self.profile}/{paths[0].name}: got {size[0]}x{size[1]}, expected {self.width}x{self.height}')
        image = None
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            if image is None:
                from io import BytesIO
                from PIL import Image
                image = Image.open(BytesIO(png)).convert('RGB')
            if path.suffix.lower() in ('.jpg', '.jpeg'):
                image.save(path, quality=95, subsampling=0)
            else:
                image.save(path, optimize=True)
            if path.resolve().is_relative_to(self.raw.resolve()):
                write_sidecar(path, xml, *size)
            print(path.relative_to(self.listing.parent) if path.resolve().is_relative_to(self.listing.parent) else path, flush=True)
        return paths
