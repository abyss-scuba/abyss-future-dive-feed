/** Recognise the editor's encoded, whole-article HTML block without losing managed comments. */
export function unwrapManagedHtmlBlock(text, marker) {
  if (typeof text !== 'string' || typeof marker !== 'string' || !marker) {
    throw new Error('Missing managed article text or marker');
  }
  const encodedStart = `&lt;!-- ${marker} --&gt;`;
  const encodedEnd = `&lt;!-- /${marker} --&gt;`;
  if (!text.includes(encodedStart) && !text.includes(encodedEnd)) return text;

  // Only the observed whole-body editor representation is supported. A mixed
  // document must be reviewed rather than receiving a second dated section.
  const match = /^\s*<div\s+data-html-block(?:=(?:""|''))?\s*>([\s\S]*)<\/div>\s*$/.exec(text);
  if (!match || match[1].includes('<')) {
    throw new Error('Encoded managed block is not a single whole-article HTML block; no overwrite');
  }
  const named = {amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0'};
  // Decode exactly one editor-escaping layer, never recursively. In particular,
  // &amp;lt; in original content must remain &lt; rather than becoming a tag.
  const decoded = match[1].replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, key) => {
    if (!key.startsWith('#')) return named[key.toLowerCase()];
    const hex = key[1].toLowerCase() === 'x';
    const point = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
      throw new Error('Invalid character in encoded managed HTML; no overwrite');
    }
    return String.fromCodePoint(point);
  });
  const start = `<!-- ${marker} -->`, end = `<!-- /${marker} -->`;
  if (decoded.split(start).length !== 2 || decoded.split(end).length !== 2 || decoded.indexOf(end) <= decoded.indexOf(start)) {
    throw new Error('Encoded managed section is missing delimiters or duplicated; no overwrite');
  }
  return decoded;
}
