/** Validate every generated listing path before rendering or writing any images. */
import fs from 'node:fs';
import path from 'node:path';
import {cardsFor, outputFile} from '../core/gallery';
import type {ListingFiles} from './project';
import {inside} from './workspace/store';

type OutputOwner = {file: string; path?: string};

export function outputProblems(files: ListingFiles): (OutputOwner & {message: string})[] {
  const problems: (OutputOwner & {message: string})[] = [];
  for (const locale of files.locales) {
    const root = path.resolve(files.listing, locale), destinations = new Map<string, OutputOwner>();
    const physical = (file: string): string => {
      let parent = file;
      for (;;) {
        try { fs.lstatSync(parent); break; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && (error as NodeJS.ErrnoException).code !== 'ENOTDIR') throw error;
          parent = path.dirname(parent);
        }
      }
      return path.join(fs.realpathSync(parent), path.relative(parent, file));
    };
    let physicalRoot: string;
    try { physicalRoot = physical(root); }
    catch { problems.push({file: 'studio.json', message: `Cannot resolve output folder ${locale}. Repair its symbolic links or choose another locale folder.`}); continue; }
    const add = (file: string, owner: OutputOwner) => {
      const destination = path.resolve(root, file);
      let canonical: string;
      try { canonical = physical(destination); }
      catch { problems.push({...owner, message: `Cannot resolve output ${file}. Repair its symbolic links or choose another output path.`}); return; }
      const relative = path.relative(root, destination);
      if (path.isAbsolute(file) || !inside(root, destination) || destination === root ||
          !inside(files.listing, root) || !inside(fs.realpathSync(files.listing), physicalRoot) ||
          !inside(physicalRoot, canonical) || path.relative(physicalRoot, canonical).split(path.sep)[0] === 'raw' ||
          relative.split(path.sep)[0] === 'raw' || ['copy.json', 'listing.json'].includes(relative)) {
        problems.push({...owner, message: `Output ${file} must stay inside ${locale}/ and outside its source files. Choose another output path.`});
        return;
      }
      const previous = destinations.get(canonical);
      if (previous) problems.push({...owner, message: `Output ${file} is also written by ${previous.file}${previous.path ? ` ${previous.path}` : ''}. Give each output a unique path.`});
      else destinations.set(canonical, owner);
    };
    if (files.config.writeAssets !== false) add('assets.json', {file: `${locale}/assets.json`});
    for (const kind of Object.keys(files.galleries)) {
      const profile = files.profiles[kind];
      if (!profile || (locale !== files.defaultLocale && profile.defaultLocaleOnly)) continue;
      const cards = cardsFor(files.galleries, kind);
      cards.forEach((card, i) => add(outputFile(kind, card, i), {file: 'gallery.json', path: `${kind}[${i}]`}));
      if (cards.length >= 2 && !profile.defaultLocaleOnly && files.config.contactSheets?.[kind] !== false)
        add(files.config.contactSheets?.[kind] || `contact-${kind}.jpg`, {file: 'studio.json', path: `contactSheets.${kind}`});
    }
    if (locale === files.defaultLocale) for (const strip of files.config.readmeStrips || []) add(strip.file, {file: 'studio.json', path: 'readmeStrips'});
  }
  return problems;
}
