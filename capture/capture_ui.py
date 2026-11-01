"""The app's screen, for `Device`: reading the UI tree, finding and tapping by label, keys and gestures."""
import re
import time

from uitree import nodes_from_xml


class Screen:
    """Needs self.foreground, self.profile, self.theme, self.scope, self.navigator and the screen size."""

    # UI tree ------------------------------------------------------------------------------------------
    def dump(self, foreground=True, timeout=60):
        """Read the UI tree (self.xml) and return its nodes. Waits for the app to draw, taps Wait on an
        "isn't responding" dialog and frees UiAutomation from a stale client."""
        deadline = time.time() + timeout
        problem = 'no UI tree'
        while True:
            self.shell('rm', '-f', '/sdcard/studio-capture.xml', check=False, retries=0)
            out = self.shell('uiautomator', 'dump', '--compressed', '/sdcard/studio-capture.xml', check=False, retries=0)
            if 'already registered' in out or 'ERROR' in out:
                problem = out.strip()
                self.free_uiautomation()
            else:
                xml = self.shell('cat', '/sdcard/studio-capture.xml', check=False, retries=0)
                if xml.lstrip().startswith('<?xml'):
                    nodes = nodes_from_xml(xml)
                    wait = next((n for n in nodes if n.get('id') == 'android:id/aerr_wait' or
                                 (n.get('pkg') == 'android' and n.get('text') == 'Wait')), None)
                    if wait:
                        self.tap_box(wait['b'])
                        problem = 'an "isn\'t responding" dialog'
                        time.sleep(3)
                        continue
                    self.xml = xml
                    if not foreground or any(n.get('pkg') == self.foreground for n in nodes):
                        return nodes
                    problem = f'{self.foreground} is not in the foreground'
            if time.time() > deadline:
                raise AssertionError(f'{self.profile}: {problem}')
            time.sleep(1.5)

    @staticmethod
    def matcher(label, text_only=False, within=None):
        pattern = re.compile(label) if isinstance(label, str) else label
        return pattern, lambda n: ((within is None or within(n['b'])) and
                                   bool(pattern.fullmatch(n.get('text', '')) or
                                        (not text_only and pattern.fullmatch(n.get('desc', '')))))

    def find(self, label, text_only=False, within=None, key=None, attempts=6, pause=1.2):
        """The node to tap for `label`: recorded (reference locale) or replayed (others) through the tap map.
        within(bounds) narrows the match by position; key replaces the label in the tap map key."""
        pattern, matches = self.matcher(label, text_only, within)
        scope = self.scope or f'{self.profile}|{self.theme}'
        for attempt in range(attempts):
            self.dump()
            try:
                if self.navigator:
                    return self.navigator.resolve(f'{scope}|{key or pattern.pattern}', self.xml, matches)
                node = next((n for n in nodes_from_xml(self.xml) if matches(n)), None)
                if node is None:
                    raise AssertionError(f'No "{pattern.pattern}" on screen')
                return node
            except AssertionError:
                if attempt == attempts - 1:
                    raise
                time.sleep(pause)

    def present(self, label, text_only=False, within=None):
        """Whether `label` is on screen now (by label in every locale, not through the tap map)."""
        matches = self.matcher(label, text_only, within)[1]
        return any(matches(n) for n in self.dump())

    def wait_for(self, label, timeout=40, text_only=False, within=None):
        matches = self.matcher(label, text_only, within)[1]
        deadline = time.time() + timeout
        while time.time() < deadline:
            node = next((n for n in self.dump() if matches(n)), None)
            if node:
                return node
            time.sleep(2)
        raise AssertionError(f'{label} never appeared')

    # input --------------------------------------------------------------------------------------------
    def tap_box(self, b):
        self.shell('input', 'tap', (b[0] + b[2]) // 2, (b[1] + b[3]) // 2)

    def tap(self, label, wait=1.5, **find):
        node = self.find(label, **find)
        self.tap_box(node['b'])
        time.sleep(wait)
        return node

    def back(self, wait=1.2):
        self.key('KEYCODE_BACK', wait)

    def key(self, code, wait=1):
        self.shell('input', 'keyevent', code)
        time.sleep(wait)

    def type(self, text, wait=1):
        self.shell('input', 'text', text.replace(' ', '%s'))
        time.sleep(wait)

    def swipe(self, x1, y1, x2, y2, duration=300, wait=1.2):
        self.shell('input', 'swipe', int(x1), int(y1), int(x2), int(y2), duration)
        time.sleep(wait)

    def scroll(self, fraction=.5, up=False, x=.5, start=.8, duration=300, wait=1.2):
        """Swipe by `fraction` of the screen height from `start` (fractions; x across the width)."""
        a, b = start, start - fraction
        if up:
            a, b = b, a
        self.swipe(self.width * x, self.height * a, self.width * x, self.height * b, duration, wait)

    def drag(self, distance, wait=1.2):
        """A slow drag scrolls exactly `distance` pixels (no fling)."""
        start = int(self.height * .8)
        self.swipe(self.width // 2, start, self.width // 2, start - distance, 1400, wait)

    def scroll_to(self, label, top, attempts=12):
        """Scroll until the element labelled `label` sits near `top` (a fraction of the screen height)."""
        matches = self.matcher(label)[1]
        for _ in range(attempts):
            node = next((n for n in self.dump() if matches(n)), None)
            if node:
                y = node['b'][1]
                if y <= self.height * top + 40:
                    if y > self.height * top + 8:
                        self.drag(int(y - self.height * top))
                    return
                self.drag(min(int(y - self.height * top), int(self.height * .55)))
            else:
                self.drag(int(self.height * .5))
        raise AssertionError(f'Could not scroll to {label}')
