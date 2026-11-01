/** A small XML reader for Android resources: elements and attributes; text, comments and declarations are skipped. */

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
}

const ENTITIES: Record<string, string> = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'"};
// At a '<': a comment, CDATA, a declaration or instruction, a closing tag, or an opening tag with its attributes.
const MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[?!][^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/y;
const ATTRIBUTE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

const decode = (value: string): string => value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, code: string) => {
  if (code[0] !== '#') return ENTITIES[code] ?? entity;
  return String.fromCodePoint(code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
});

/** Escape a value for a double-quoted attribute. */
export const escapeAttribute = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** The attributes of one tag's markup, e.g. `<svg viewBox="0 0 108 108">`. */
export function attributes(markup: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, double, single] of markup.matchAll(ATTRIBUTE)) found[name] = decode(double ?? single);
  return found;
}

/** The document's root element. Throws on markup that doesn't nest. */
export function parseXml(text: string): XmlElement {
  const top: XmlElement = {name: '', attributes: {}, children: []};
  const open = [top];
  const line = (at: number): number => text.slice(0, at).split('\n').length;
  for (let at = text.indexOf('<'); at >= 0; at = text.indexOf('<', MARKUP.lastIndex)) {
    MARKUP.lastIndex = at;
    const match = MARKUP.exec(text);
    if (!match) throw new Error(`unreadable markup on line ${line(at)}`);
    const [, closing, name, attrs, empty] = match;
    const parent = open[open.length - 1];
    if (closing) {
      if (closing !== parent.name) throw new Error(`</${closing}> on line ${line(at)} closes <${parent.name || 'nothing'}>`);
      open.pop();
    } else if (name) {
      const element: XmlElement = {name, attributes: attributes(attrs), children: []};
      parent.children.push(element);
      if (!empty) open.push(element);
    }
  }
  if (open.length > 1) throw new Error(`<${open[open.length - 1].name}> is never closed`);
  if (!top.children.length) throw new Error('no elements');
  return top.children[0];
}

/** The first element named `name`, depth first, from `element` itself down. */
export function findElement(element: XmlElement, name: string): XmlElement | undefined {
  if (element.name === name) return element;
  for (const child of element.children) {
    const found = findElement(child, name);
    if (found) return found;
  }
  return undefined;
}
