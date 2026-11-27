// The agent skill an app keeps at .claude/skills/store-screenshots/SKILL.md: installed by init, kept current with the
// studio, and left alone once the app makes it its own.
import fs from 'node:fs';
import path from 'node:path';

/** The package this runs from (its skills/). */
const PACKAGE = path.resolve(__dirname, '..');

/** Where an app keeps the agent skill, relative to the app. */
export const SKILL_FILE = '.claude/skills/store-screenshots/SKILL.md';
/** The line that marks an app's skill as the studio's to keep current; without it, the file is the app's own. */
const SKILL_MARKER = '<!-- Installed by screenshot-studio, which keeps it current: npx screenshot-studio init. Delete this line to keep your own edits. -->';

/** The skill as the studio installs it: the package's, with the marker after its front matter. */
function skillText(): string | null {
  const source = path.join(PACKAGE, 'skills', 'store-screenshots', 'SKILL.md');
  if (!fs.existsSync(source)) return null;
  const text = fs.readFileSync(source, 'utf8');
  const end = text.startsWith('---') ? text.indexOf('\n---', 3) + 4 : 0;
  return `${text.slice(0, end)}\n${SKILL_MARKER}\n${text.slice(end)}`;
}

/** The app's skill against this studio's: missing, current, stale (an older studio's), or the app's own. */
export function skillState(app: string): 'missing' | 'current' | 'stale' | 'own' {
  const file = path.join(app, SKILL_FILE);
  if (!fs.existsSync(file)) return 'missing';
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(SKILL_MARKER)) return 'own';
  return text === skillText() ? 'current' : 'stale';
}

/** Install the skill in an app, or bring the studio's copy up to date; an app's own edited skill is left alone. */
export function installSkill(app: string): 'created' | 'updated' | 'current' | 'own' | null {
  const text = skillText();
  if (!text) return null;
  const state = skillState(app);
  if (state === 'current' || state === 'own') return state;
  fs.mkdirSync(path.dirname(path.join(app, SKILL_FILE)), {recursive: true});
  fs.writeFileSync(path.join(app, SKILL_FILE), text);
  return state === 'missing' ? 'created' : 'updated';
}
