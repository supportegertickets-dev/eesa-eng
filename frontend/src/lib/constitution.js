/**
 * Turns an uploaded constitution into readable documentation.
 *
 * The document is read in the browser: every page of a PDF, the paragraphs of
 * a Word file (with its automatic numbering rebuilt, since Word does not store
 * "Article 1" in the text when it numbers headings itself), or a text file.
 * The text is then split into articles at headings such as "ARTICLE IV –
 * ELECTIONS", "Chapter Two" or "5. FINANCE". The administrator checks and
 * corrects the result before it is published.
 */
import { loadPdfDocument } from '@/lib/pdf';

export const ACCEPTED_FILES = '.pdf,.docx,.doc,.txt';
export const READABLE_EXTENSIONS = ['pdf', 'docx', 'txt'];

export const extensionOf = (file) => (file?.name?.split('.').pop() || '').toLowerCase();

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

const PAGE_NUMBER = /^(?:page\s*)?[-–—(]?\s*\d{1,3}\s*[-–—)]?(?:\s*(?:of|\/)\s*\d{1,3})?$/i;

/**
 * Lines of a PDF, rebuilt from positioned text. Repeated page headers and
 * footers, and page numbers, are dropped.
 */
const readPdf = async (file, onProgress) => {
  const doc = await loadPdfDocument(file);
  const pages = [];
  try {
    for (let number = 1; number <= doc.numPages; number += 1) {
      onProgress?.({ page: number, pages: doc.numPages });
      const page = await doc.getPage(number);
      const content = await page.getTextContent();

      const lines = [];
      let current = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const [, , , scaleY, x, y] = item.transform;
        const size = Math.abs(scaleY) || item.height || 10;
        // A change of baseline starts a new line.
        if (!current || Math.abs(y - current.y) > size * 0.5) {
          if (current) lines.push(current);
          current = { text: '', y, end: x, size };
        }
        if (item.str) {
          const gap = x - current.end;
          if (current.text && gap > size * 0.15 && !current.text.endsWith(' ') && !item.str.startsWith(' ')) current.text += ' ';
          current.text += item.str;
          current.end = x + (item.width || 0);
          current.size = Math.max(current.size, size);
        }
        if (item.hasEOL) {
          lines.push(current);
          current = null;
        }
      }
      if (current) lines.push(current);
      pages.push(lines.map((line) => ({ text: line.text.replace(/\s+/g, ' ').trim(), size: line.size })).filter((line) => line.text));
      page.cleanup();
    }
  } finally {
    doc.destroy();
  }

  // Text that repeats at the top or bottom of most pages is a running header or footer.
  const repeated = new Set();
  if (pages.length >= 3) {
    const counts = new Map();
    for (const lines of pages) {
      const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map((line) => line.text.toLowerCase()));
      for (const text of edges) counts.set(text, (counts.get(text) || 0) + 1);
    }
    for (const [text, count] of counts) if (count >= pages.length * 0.5) repeated.add(text);
  }

  return pages.flatMap((lines, pageIndex) => lines
    .filter((line) => !PAGE_NUMBER.test(line.text) && !repeated.has(line.text.toLowerCase()))
    .map((line) => ({ ...line, page: pageIndex + 1 })));
};

/* Word ------------------------------------------------------------- */

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const wAttr = (el, name) => el?.getAttributeNS(W_NS, name) ?? el?.getAttribute(`w:${name}`) ?? null;
const child = (el, name) => el?.getElementsByTagNameNS(W_NS, name)?.[0] || null;

const toRoman = (n) => {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  let rest = n;
  for (const [value, symbol] of map) while (rest >= value) { out += symbol; rest -= value; }
  return out;
};

const toLetters = (n) => {
  let out = '';
  let rest = n;
  while (rest > 0) { rest -= 1; out = String.fromCharCode(97 + (rest % 26)) + out; rest = Math.floor(rest / 26); }
  return out;
};

const ORDINAL_WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];

const formatNumber = (n, format) => {
  switch (format) {
    case 'upperRoman': return toRoman(n);
    case 'lowerRoman': return toRoman(n).toLowerCase();
    case 'upperLetter': return toLetters(n).toUpperCase();
    case 'lowerLetter': return toLetters(n);
    case 'cardinalText': return ORDINAL_WORDS[n] || String(n);
    case 'bullet': return '•';
    case 'none': return '';
    default: return String(n);
  }
};

/** Level formats from numbering.xml, by numId and level. */
const readNumbering = (xml) => {
  if (!xml) return new Map();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const abstract = new Map();
  for (const node of doc.getElementsByTagNameNS(W_NS, 'abstractNum')) {
    const levels = new Map();
    for (const lvl of node.getElementsByTagNameNS(W_NS, 'lvl')) {
      levels.set(Number(wAttr(lvl, 'ilvl')), {
        format: wAttr(child(lvl, 'numFmt'), 'val') || 'decimal',
        text: wAttr(child(lvl, 'lvlText'), 'val') ?? '%1.',
        start: Number(wAttr(child(lvl, 'start'), 'val') || 1),
      });
    }
    abstract.set(wAttr(node, 'abstractNumId'), levels);
  }
  const numbering = new Map();
  for (const node of doc.getElementsByTagNameNS(W_NS, 'num')) {
    numbering.set(wAttr(node, 'numId'), abstract.get(wAttr(child(node, 'abstractNumId'), 'val')) || new Map());
  }
  return numbering;
};

/** Heading level from a paragraph style id such as "Heading1" or "Title". */
const headingLevel = (styleId, styleNames) => {
  const name = (styleNames.get(styleId) || styleId || '').toLowerCase().replace(/\s+/g, '');
  const match = name.match(/^heading(\d)$/);
  if (match) return Number(match[1]);
  if (name === 'title') return 0;
  return null;
};

const readDocx = async (file) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('This Word file has no readable text.');

  const numbering = readNumbering(await zip.file('word/numbering.xml')?.async('string'));
  const styleNames = new Map();
  // Headings are often numbered by their style ("Article %1" on Heading 1)
  // rather than paragraph by paragraph.
  const styleNumbering = new Map();
  const stylesXml = await zip.file('word/styles.xml')?.async('string');
  if (stylesXml) {
    const styles = new DOMParser().parseFromString(stylesXml, 'application/xml');
    for (const style of styles.getElementsByTagNameNS(W_NS, 'style')) {
      const id = wAttr(style, 'styleId');
      styleNames.set(id, wAttr(child(style, 'name'), 'val') || '');
      const numPr = child(child(style, 'pPr'), 'numPr');
      if (numPr) styleNumbering.set(id, numPr);
    }
  }

  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const counters = new Map();
  const lines = [];

  for (const paragraph of doc.getElementsByTagNameNS(W_NS, 'p')) {
    let text = '';
    for (const node of paragraph.getElementsByTagNameNS(W_NS, '*')) {
      if (node.localName === 't') text += node.textContent;
      else if (node.localName === 'tab') text += ' ';
      else if (node.localName === 'br' || node.localName === 'cr') text += ' ';
    }
    text = text.replace(/\s+/g, ' ').trim();

    const props = child(paragraph, 'pPr');
    const styleId = wAttr(child(props, 'pStyle'), 'val');
    const numPr = child(props, 'numPr') || styleNumbering.get(styleId);
    let prefix = '';
    if (numPr) {
      // A paragraph can override only the level and keep its style's list.
      const numId = wAttr(child(numPr, 'numId'), 'val') ?? wAttr(child(styleNumbering.get(styleId), 'numId'), 'val');
      const level = Number(wAttr(child(numPr, 'ilvl'), 'val') ?? wAttr(child(styleNumbering.get(styleId), 'ilvl'), 'val') ?? 0);
      const levels = numbering.get(numId);
      if (levels && numId !== '0') {
        const count = counters.get(numId) || [];
        count[level] = (count[level] ?? ((levels.get(level)?.start || 1) - 1)) + 1;
        // Starting a higher level restarts every level beneath it.
        count.length = level + 1;
        counters.set(numId, count);
        const format = levels.get(level);
        if (format && format.format !== 'bullet') {
          prefix = format.text.replace(/%(\d)/g, (_, n) => {
            const at = Number(n) - 1;
            const value = count[at] ?? levels.get(at)?.start ?? 1;
            return formatNumber(value, levels.get(at)?.format || 'decimal');
          }).trim();
        } else if (format?.format === 'bullet') {
          prefix = '•';
        }
      }
    }

    if (!text) continue;
    lines.push({
      text: prefix ? `${prefix} ${text}` : text,
      heading: headingLevel(styleId, styleNames),
      paragraph: true,
    });
  }
  return lines;
};

const readText = async (file) => (await file.text())
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((line) => ({ text: line.replace(/\s+/g, ' ').trim(), blank: !line.trim() }));

/**
 * Read a document's lines.
 * @returns {Promise<Array<{ text: string, heading?: number|null, paragraph?: boolean, blank?: boolean, size?: number }>>}
 */
export async function readDocument(file, { onProgress } = {}) {
  const extension = extensionOf(file);
  if (extension === 'pdf') return readPdf(file, onProgress);
  if (extension === 'docx') return readDocx(file);
  if (extension === 'txt') return readText(file);
  throw new Error('Only PDF, Word (.docx) and text files can be read. Save the document in one of those formats, or add the articles by hand.');
}

/* ------------------------------------------------------------------ *
 * Splitting into articles
 * ------------------------------------------------------------------ */

const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
const ARTICLE_HEADING = new RegExp(`^(article|chapter|part)\\s+(\\d{1,3}[a-z]?|[ivxlc]{1,7}|(?:${NUMBER_WORDS})(?:[-\\s](?:${NUMBER_WORDS}))?)\\b\\s*[:.)\\-–—]*\\s*(.*)$`, 'i');
const SECTION_HEADING = /^(section)\s+(\d{1,3}|[ivxlc]{1,7})\b\s*[:.)\-–—]*\s*(.*)$/i;
const NUMBERED_CAPS_HEADING = /^(\d{1,2})[.)]?\s+([A-Z][A-Z0-9 ,&'’()/-]{2,90})$/;
const STANDALONE_HEADINGS = /^(preamble|introduction|foreword|definitions|interpretation|schedules?|appendix(?:\s+[a-z0-9]+)?|annex(?:ure)?(?:\s+[a-z0-9]+)?|amendments?|dissolution|citation)\s*:?$/i;
// Words that mark a line as a sentence rather than a heading.
const PROSE = /\b(shall|must|hereby|herein|thereof|whereas|in accordance|of this constitution|provided that)\b/i;

/** A clause or list marker at the start of a paragraph: 1. 1.1 (a) a) (iv) • */
export const CLAUSE_MARKER = /^((?:\d{1,3}(?:\.\d{1,3}){0,3}[.)]?)|(?:\([a-z]{1,4}\))|(?:[a-z][.)])|(?:[ivx]{1,5}[.)])|(?:\(\d{1,3}\))|[•●▪◦*–-])\s+/i;

const isAllCaps = (text) => {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
};

const looksLikeTitle = (text) => text.length <= 120 && !CLAUSE_MARKER.test(text) && !/[.;,]$/.test(text) && !PROSE.test(text);

// Kept in capitals when a capitalised heading is put into title case.
const ACRONYMS = new Set(['eesa', 'ebk', 'iek', 'ieee', 'agm', 'sgm', 'nec']);

const tidyTitle = (text) => {
  const clean = text.replace(/\s+/g, ' ').replace(/^[\s:.\-–—]+|[\s:.\-–—]+$/g, '');
  if (!isAllCaps(clean)) return clean;
  // "OFFICE BEARERS AND THEIR DUTIES" -> "Office Bearers and Their Duties"
  const small = new Set(['and', 'of', 'the', 'for', 'in', 'to', 'on', 'a', 'an', 'or', 'by', 'at']);
  return clean.toLowerCase().split(' ').map((word, i) => {
    if (/^[ivx]{1,4}$/i.test(word)) return word.toUpperCase();
    if (ACRONYMS.has(word.replace(/[^a-z]/g, ''))) return word.toUpperCase();
    if (i > 0 && small.has(word)) return word;
    return word.replace(/^[(\W]*[a-z]/, (start) => start.toUpperCase());
  }).join(' ');
};

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** "ARTICLE iv" -> "Article IV", "chapter two" -> "Chapter Two". */
const headingLabel = (keyword, number) => {
  const value = String(number).trim();
  const tidy = /^[ivxlc]+$/i.test(value)
    ? value.toUpperCase()
    : value.split(/([-\s])/).map((part) => (/^[a-z]/i.test(part) ? capitalise(part) : part)).join('');
  return `${capitalise(keyword)} ${tidy}`;
};

/** Read one line as a heading of the given kind, or null. */
const matchHeading = (text, strategy) => {
  if (strategy === 'article' || strategy === 'section') {
    const match = text.match(strategy === 'article' ? ARTICLE_HEADING : SECTION_HEADING);
    if (!match) return null;
    const rest = match[3] || '';
    // "Article 12 shall apply to..." is a sentence that happens to start a line.
    if (rest && (PROSE.test(rest) || rest.length > 90)) return null;
    return { number: headingLabel(match[1], match[2]), title: rest };
  }
  if (strategy === 'numbered') {
    const match = text.match(NUMBERED_CAPS_HEADING);
    return match ? { number: match[1], title: match[2] } : null;
  }
  if (strategy === 'caps') {
    return text.length <= 80 && isAllCaps(text) && !CLAUSE_MARKER.test(text) && !/[.;,]$/.test(text) && !PROSE.test(text)
      ? { number: '', title: text }
      : null;
  }
  return null;
};

/** Candidate headings under one strategy, as { index, number, title }. */
const findHeadings = (lines, strategy) => {
  // Word files that use heading styles say outright which lines are headings.
  if (strategy === 'styles') {
    const top = lines.some((line) => line.heading === 1) ? 1 : 2;
    return lines.flatMap((line, index) => {
      if (line.heading !== top || !line.text) return [];
      const parsed = matchHeading(line.text, 'article') || matchHeading(line.text, 'numbered');
      return [{ index, ...(parsed || { number: '', title: line.text }) }];
    });
  }
  return lines.flatMap((line, index) => {
    const parsed = line.text && matchHeading(line.text, strategy);
    return parsed ? [{ index, ...parsed }] : [];
  });
};

/**
 * Join a PDF's visual lines into paragraphs. A line starts a paragraph when it
 * begins with a clause marker, or when the line before it ended a sentence and
 * stopped short of the full line width.
 */
const toParagraphs = (lines) => {
  const widths = lines.filter((l) => l.text && l.text.length > 20).map((l) => l.text.length).sort((a, b) => a - b);
  const typical = widths[Math.floor(widths.length * 0.75)] || 80;

  const paragraphs = [];
  let previous = null;
  for (const line of lines) {
    if (line.blank || !line.text) { previous = null; continue; }
    const text = line.text;
    const startsNew = !previous
      || line.paragraph
      || CLAUSE_MARKER.test(text)
      || (/[.:;!?]["”’)]?$/.test(previous.text) && previous.text.length < typical * 0.85);

    if (startsNew) {
      paragraphs.push(text);
    } else {
      const last = paragraphs.length - 1;
      // Rejoin a word hyphenated across lines.
      paragraphs[last] = /[a-z]-$/.test(paragraphs[last]) && /^[a-z]/.test(text)
        ? paragraphs[last].slice(0, -1) + text
        : `${paragraphs[last]} ${text}`;
    }
    previous = line;
  }
  return paragraphs;
};

const DATE_PATTERN = /\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?[A-Z][a-z]+,?\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+\s+\d{4})/;

/** A version number and adoption date, if the document states them. */
const guessMetadata = (text) => {
  const version = text.match(/\bversion\s*(?:no\.?|number)?\s*[:\-–]?\s*(\d+(?:\.\d+){0,2})\b/i)?.[1] || '';

  let adoptedOn = '';
  const adopted = text.match(/\b(?:adopted|ratified|approved|amended)\b/i);
  const dateText = adopted && text.slice(adopted.index, adopted.index + 60).match(DATE_PATTERN)?.[1];
  if (dateText) {
    const parsed = new Date(dateText.replace(/(\d)(st|nd|rd|th)/, '$1').replace(/\bof\s+/, ''));
    if (!Number.isNaN(parsed.getTime())) {
      // Local date parts: toISOString would shift a midnight date back a day east of UTC.
      adoptedOn = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }
  }
  return { version, adoptedOn };
};

/**
 * The document's own title from its title page: the line naming the
 * constitution, with any capitalised lines that continue it.
 */
const titleFrom = (prelude) => {
  const start = prelude.findIndex((line) => /constitution/i.test(line.text));
  if (start < 0) return '';
  let title = prelude[start].text;
  for (const line of prelude.slice(start + 1, start + 3)) {
    if (!isAllCaps(line.text) || /version|adopted|ratified/i.test(line.text) || title.length + line.text.length > 160) break;
    title += ` ${line.text}`;
  }
  return title;
};

const STRATEGIES = ['styles', 'article', 'numbered', 'section', 'caps'];

/**
 * Split document lines into articles.
 * @returns {{ sections: Array<{ number, title, body }>, title: string, strategy: string, version: string, adoptedOn: string }}
 */
export function splitIntoSections(lines) {
  const clean = lines.filter((line) => line.blank || line.text);
  const content = clean.filter((line) => !line.blank);

  // The first scheme that finds at least two headings wins.
  let strategy = 'none';
  let headings = [];
  for (const candidate of STRATEGIES) {
    if (candidate === 'styles' && !content.some((line) => line.heading >= 1)) continue;
    const found = findHeadings(clean, candidate);
    if (found.length >= 2) { strategy = candidate; headings = found; break; }
  }

  // Preamble, Definitions and the like head their own part whatever the scheme.
  if (strategy !== 'none' && strategy !== 'caps') {
    const taken = new Set(headings.map((h) => h.index));
    clean.forEach((line, index) => {
      if (!taken.has(index) && line.text && STANDALONE_HEADINGS.test(line.text)) headings.push({ index, number: '', title: line.text });
    });
    headings.sort((a, b) => a.index - b.index);
  }

  const meta = guessMetadata(content.map((line) => line.text).join('\n'));

  if (!headings.length) {
    return { sections: [{ number: '', title: 'Constitution', body: toParagraphs(clean).join('\n') }], title: '', strategy, ...meta };
  }

  const sections = [];

  // Text before the first heading: a title page, or a preamble without a heading.
  const prelude = clean.slice(0, headings[0].index).filter((line) => line.text);
  const styledTitle = content.find((line) => line.heading === 0)?.text;
  const titleLine = styledTitle || titleFrom(prelude);
  if (prelude.map((line) => line.text).join(' ').length > 300) {
    sections.push({ number: '', title: 'Preamble', body: toParagraphs(prelude).join('\n') });
  }

  headings.forEach((heading, position) => {
    const end = position + 1 < headings.length ? headings[position + 1].index : clean.length;
    let start = heading.index + 1;
    let title = heading.title.trim();

    // "ARTICLE III" with its name on the following line.
    if (!title) {
      const offset = clean.slice(start, end).findIndex((line) => !line.blank);
      const candidate = offset >= 0 ? clean[start + offset] : null;
      if (candidate && looksLikeTitle(candidate.text)) {
        title = candidate.text;
        start += offset + 1;
      }
    }

    sections.push(title
      ? { number: heading.number, title: tidyTitle(title), body: toParagraphs(clean.slice(start, end)).join('\n') }
      // A heading with no name reads as its label alone, "Article IV".
      : { number: '', title: heading.number || 'Untitled', body: toParagraphs(clean.slice(start, end)).join('\n') });
  });

  return { sections, title: titleLine ? tidyTitle(titleLine) : '', strategy, ...meta };
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

const slug = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);

/** A stable anchor for an article, used by the contents list and shared links. */
export const sectionAnchor = (section, index) => `article-${index + 1}${section.title ? `-${slug(section.title)}` : ''}`;

/** "Article IV: Elections", "5. Finance", or the title alone when unnumbered. */
export const sectionHeading = (section) => {
  if (!section.number) return section.title;
  return /^\d+$/.test(section.number) ? `${section.number}. ${section.title}` : `${section.number}: ${section.title}`;
};

/**
 * Indentation for a clause, from its marker: 1. -> 0; 1.1, (a) or (1) -> 1;
 * 1.1.1 or (ii) -> 2.
 */
export const clauseLevel = (marker) => {
  const trimmed = marker.trim();
  const numeric = trimmed.replace(/\)$/, '').replace(/\.$/, '');
  if (/^\d+(\.\d+)*$/.test(numeric)) return Math.min(3, numeric.split('.').length - 1);
  if (/^[ivx]{2,}$/i.test(trimmed.replace(/[().]/g, ''))) return 2;
  return 1;
};
