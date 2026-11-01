"""What Android and iOS capture runs share: the app's listing, the capture locale, --only and --profile, and
where each shot goes."""
import json
import os
import re
import sys
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


class Tour:
    def __init__(self, args, listing=None):
        """args: parsed arguments (--locale, --only, --profile). listing: the store-listing folder (default: found
        when the tour starts, so commands like `reset` run without an app)."""
        listing = listing or find_listing()
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
        only = getattr(args, 'only', None)
        self.only = set(only.split(',')) if only else None
        self.selected = getattr(args, 'profile', None)

    def profile_config(self, only=None):
        """profiles.json and the profile names to capture: `only`, else --profile (empty: all)."""
        only = only or ([] if self.selected in (None, 'all') else self.selected.split(','))
        config = json.loads((self.listing / 'profiles.json').read_text())
        unknown = set(only) - set(config)
        if unknown:
            raise SystemExit(f'No profile {", ".join(sorted(unknown))} in profiles.json')
        return config, only

    def target(self, name):
        """A plain name is <locale>/raw/<profile>/<name>.png; a relative path with a folder or extension sits under
        <locale>/raw; a Path is used as is."""
        if isinstance(name, Path):
            return name
        if '/' in name or '.' in name:
            return self.raw / name
        return self.raw / self.profile / f'{name}.png'
