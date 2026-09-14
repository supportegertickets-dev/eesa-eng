/**
 * Work out where an uploaded file belongs by reading the file itself.
 *
 * The file name and the opening text of PDFs, Word documents, PowerPoint decks
 * and text files are scanned for a unit code, the unit's name, the year and
 * semester, and the kind of document. Everything runs in the browser, so the
 * member sees the suggestion before uploading and nothing is sent twice. The
 * member can correct any of it, and the server validates the result.
 */
import { findUnitCodes, fileKind, titleFromFileName } from '@/lib/library';
import { loadPdfJs } from '@/lib/pdf';

const SCAN_CHARS = 6000;
const READ_TIMEOUT_MS = 8000;

/* ------------------------------------------------------------------ *
 * Reading text
 * ------------------------------------------------------------------ */

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
]);

const readPdfText = async (file) => {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  try {
    let text = '';
    for (let pageNumber = 1; pageNumber <= Math.min(2, doc.numPages) && text.length < SCAN_CHARS; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('')}\n`;
    }
    return text;
  } finally {
    doc.destroy();
  }
};

const XML_ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };

const xmlToText = (xml) => xml
  .replace(/<\/(?:w|a):p>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);

const slideNumber = (name) => Number(name.match(/(\d+)\.xml$/)?.[1] || 0);

const readOfficeText = async (file, kind) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files);

  // Exam papers often carry the unit code in the page header.
  const parts = kind === 'word'
    ? [...names.filter((n) => /^word\/header\d*\.xml$/.test(n)).sort(), 'word/document.xml']
    : names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNumber(a) - slideNumber(b)).slice(0, 3);

  let text = '';
  for (const name of parts) {
    const entry = zip.file(name);
    if (entry) text += `${xmlToText(await entry.async('string'))}\n`;
    if (text.length >= SCAN_CHARS) break;
  }
  return text;
};

const readText = (file) => {
  const kind = fileKind(file);
  if (kind === 'pdf') return readPdfText(file);
  // Only the modern zip-based formats can be read; .doc and .ppt cannot.
  if ((kind === 'word' && /\.docx$/i.test(file.name)) || (kind === 'slides' && /\.pptx$/i.test(file.name))) {
    return readOfficeText(file, kind);
  }
  if (kind === 'text') return file.slice(0, SCAN_CHARS * 2).text();
  return Promise.resolve('');
};

/* ------------------------------------------------------------------ *
 * Interpreting it
 * ------------------------------------------------------------------ */

const TYPE_RULES = [
  ['past-papers', /\b(past\s*papers?|exam(?:ination)?s?|cat\s*\d?|supplementary|special\s+exam|question\s+paper|marking\s+scheme|instructions\s+to\s+candidates|answer\s+(?:all|any)\b)/i],
  ['lab-reports', /\b(lab(?:oratory)?|practicals?|experiments?)\b/i],
  ['tutorials', /\b(tutorials?|assignments?|problem\s+sets?|exercises?|worksheets?|revision\s+questions?)\b/i],
  ['textbooks', /\b(text\s?books?|edition|isbn|publishers?|all\s+rights\s+reserved)\b/i],
  ['notes', /\b(lectures?|notes|slides|chapters?|topics?|modules?|handouts?)\b/i],
];

/** The kind of document, judged by its name first and then its opening text. */
const detectType = (fileName, text) => {
  const name = fileName.replace(/[_-]+/g, ' ');
  const byName = TYPE_RULES.find(([, pattern]) => pattern.test(name));
  if (byName) return byName[0];
  const head = text.slice(0, 1500);
  const byText = TYPE_RULES.find(([, pattern]) => pattern.test(head));
  return byText ? byText[0] : 'notes';
};

const ORDINALS = {
  FIRST: 1, '1ST': 1, I: 1, 1: 1,
  SECOND: 2, '2ND': 2, II: 2, 2: 2,
  THIRD: 3, '3RD': 3, III: 3, 3: 3,
  FOURTH: 4, '4TH': 4, IV: 4, 4: 4,
  FIFTH: 5, '5TH': 5, V: 5, 5: 5,
};

/**
 * Year and semester, from phrases such as "FOURTH YEAR SECOND SEMESTER" or
 * "Year IV Semester 2". Failing that, the unit number usually starts with the
 * year of study (EEEN 481 is a fourth-year unit), which is offered as a guess.
 */
const detectPlacement = (text, unitCode) => {
  const upper = text.toUpperCase();
  const year = (upper.match(/\b(FIRST|SECOND|THIRD|FOURTH|FIFTH|1ST|2ND|3RD|4TH|5TH)\s+YEAR\b/)
    || upper.match(/\bYEAR\s*(?:OF\s+STUDY\s*)?[:-]?\s*(IV|V|I{1,3}|[1-5])\b/) || [])[1];
  const semester = (upper.match(/\b(FIRST|SECOND|1ST|2ND)\s+SEMESTER\b/)
    || upper.match(/\bSEMESTER\s*[:-]?\s*(II|I|[12])\b/) || [])[1];

  if (year) return { year: ORDINALS[year], semester: ORDINALS[semester] || null, source: 'document' };

  const guess = Number(unitCode?.split(' ')[1]?.[0]);
  if (guess >= 1 && guess <= 5) return { year: guess, semester: ORDINALS[semester] || null, source: 'unit code' };
  return { year: null, semester: ORDINALS[semester] || null, source: semester ? 'document' : null };
};

const KEEP_UPPERCASE = new Set(['I', 'II', 'III', 'IV', 'V', 'AC', 'DC', 'RF', 'CAD', 'VLSI', 'PLC', 'PLCS', 'IOT', 'HIV', 'AIDS', 'DSP', 'ICT']);
const LOWERCASE_WORDS = new Set(['and', 'of', 'for', 'in', 'the', 'to', 'on', 'with', 'a', 'an']);

/** "POWER SYSTEMS AND PROTECTION" -> "Power Systems and Protection" */
const tidyCase = (name) => {
  if (name !== name.toUpperCase()) return name;
  return name.split(' ').map((word, index) => {
    if (KEEP_UPPERCASE.has(word.replace(/[^A-Z]/g, ''))) return word;
    const lower = word.toLowerCase();
    if (index > 0 && LOWERCASE_WORDS.has(lower)) return lower;
    return lower.replace(/^[a-z(]+/, (start) => start.replace(/[a-z]/, (c) => c.toUpperCase()));
  }).join(' ');
};

/** The unit's name, as printed after its code: "EEEN 481: PROJECT MANAGEMENT". */
const detectUnitName = (text, unitCode) => {
  if (!unitCode) return '';
  const [letters, digits] = unitCode.split(' ');
  const match = text.match(new RegExp(`${letters}[ \\t_-]{0,3}${digits}\\s*[:\\-–—.|]?\\s*([^\\n]{4,160})`, 'i'));
  if (!match) return '';

  const name = match[1]
    .split(/:|\s{3,}|\b(?:DATE|TIME|DURATION|INSTRUCTIONS?|MARKS|STREAMS?|VENUE|LECTURER)\b|\(\s*\d|\d+\s*(?:HOURS?|HRS)/i)[0]
    .replace(/[^A-Za-z0-9&,()/'\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[\s,\-]+$/, '')
    .trim();

  if (name.length < 4 || !/[A-Za-z]{3}/.test(name) || findUnitCodes(name).length) return '';
  return tidyCase(name).slice(0, 150);
};

/**
 * Suggest how to file an uploaded file.
 *
 * @param {File} file
 * @param {Array} units known units, used to prefer a code that already exists
 * @returns {Promise<{ title, category, unitCode, unitId, unitName, year, semester, sources, scanned }>}
 */
export async function analyzeFile(file, units = []) {
  const known = new Map(units.map((unit) => [unit.code, unit]));

  let text = '';
  try {
    text = (await withTimeout(readText(file), READ_TIMEOUT_MS)).slice(0, SCAN_CHARS);
  } catch {
    // An unreadable or slow file still gets suggestions from its name.
  }

  const nameCodes = findUnitCodes(file.name);
  const textCodes = findUnitCodes(text);
  const unitCode = nameCodes.find((c) => known.has(c)) || textCodes.find((c) => known.has(c))
    || nameCodes[0] || textCodes[0] || '';
  const unit = known.get(unitCode) || null;
  const placement = unit ? { year: unit.year, semester: unit.semester, source: 'unit' } : detectPlacement(text, unitCode);

  return {
    title: titleFromFileName(file.name),
    category: detectType(file.name, text),
    unitCode,
    unitId: unit?._id || '',
    unitName: unit ? unit.name : detectUnitName(text, unitCode),
    year: placement.year ?? '',
    semester: placement.semester ?? '',
    sources: {
      unit: unitCode ? (nameCodes.includes(unitCode) ? 'file name' : 'document') : null,
      placement: placement.source,
    },
    scanned: Boolean(text.trim()),
  };
}
