/**
 * Library vocabulary shared by the models, routes and migration script.
 *
 * Course units are data (models/Unit.js), managed from the portal. Only the
 * shape of a unit code and the fixed set of document types live in code.
 */

const RESOURCE_TYPES = ['notes', 'past-papers', 'textbooks', 'tutorials', 'lab-reports', 'other'];

const TYPE_LABELS = {
  notes: 'Lecture notes',
  'past-papers': 'Past papers',
  textbooks: 'Textbooks',
  tutorials: 'Tutorials & assignments',
  'lab-reports': 'Lab reports',
  other: 'Other'
};

const YEARS = [1, 2, 3, 4, 5];
const SEMESTERS = [1, 2];

/** A stored unit code: 2–6 letters, one space, 3–4 digits, e.g. "EEEN 481". */
const UNIT_CODE_FORMAT = /^[A-Z]{2,6} \d{3,4}$/;

// Letters followed by a number that are never a unit code: "PAGE 120",
// "APRIL 2024", "ISO 9001". Without these a file named "Notes April 2024.pdf"
// would be filed under a unit called APRIL 2024.
const NOT_UNIT_PREFIXES = new Set([
  'PAGE', 'PAGES', 'PG', 'PP', 'YEAR', 'YEARS', 'YR', 'ROOM', 'RM', 'BOX', 'FIG', 'FIGURE',
  'TABLE', 'NO', 'NUM', 'TEL', 'FAX', 'ISBN', 'ISSN', 'ISO', 'IEEE', 'IEC', 'VOL', 'CHAPTER',
  'CH', 'SECTION', 'SEC', 'SEM', 'LEVEL', 'CLASS', 'GROUP', 'PART', 'STEP', 'UNIT', 'CODE',
  'EXAM', 'CAT', 'QUIZ', 'TEST', 'LAB', 'IMG', 'DSC', 'SCAN', 'DOC', 'FILE', 'COPY', 'PHOTO',
  'VID', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV',
  'DEC', 'MARCH', 'APRIL', 'JUNE', 'JULY', 'AUGUST', 'TIME', 'DATE', 'HRS', 'MIN', 'MINS',
  'AM', 'PM', 'KES', 'KSH', 'USD', 'MARKS', 'TOTAL', 'SIZE', 'NOTE', 'NOTES', 'QN', 'WEEK',
  'DAY', 'TERM', 'ROUND', 'BATCH', 'SERIES', 'MODEL', 'TYPE', 'REV', 'VER', 'ED', 'EDITION'
]);

const CODE_IN_TEXT = /(?:^|[^A-Z0-9])([A-Z]{2,6})[ \t_-]{0,3}(\d{3,4})(?![A-Z0-9])/g;

/** "eeen481", "EEEN-481" and "EEEN 481" all become "EEEN 481"; anything else is null. */
const normalizeUnitCode = (value) => {
  const match = String(value || '').toUpperCase().trim().match(/^([A-Z]{2,6})[\s_-]*(\d{3,4})$/);
  return match ? `${match[1]} ${match[2]}` : null;
};

/** Every distinct unit code mentioned in some text, in order of appearance. */
const findUnitCodes = (text = '') => {
  const codes = [];
  for (const match of String(text).toUpperCase().matchAll(CODE_IN_TEXT)) {
    if (NOT_UNIT_PREFIXES.has(match[1])) continue;
    // "Notes 2023" and "List 2024" name a year, not a unit.
    if (/^(19|20)\d{2}$/.test(match[2])) continue;
    const code = `${match[1]} ${match[2]}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
};

const detectUnitCode = (text) => findUnitCodes(text)[0] || null;

/** Human-readable location of a unit, e.g. "Year 4 › Semester 2 › EEEN 481". */
const folderPath = ({ year, semester, code }) => [
  year ? `Year ${year}` : 'Other units',
  year && semester ? `Semester ${semester}` : null,
  code
].filter(Boolean).join(' › ');

/** A readable default title from a file name: "EEEN_481-notes.pdf" -> "EEEN 481-notes". */
const titleFromFileName = (name = '') => String(name)
  .replace(/\.[^.]+$/, '')
  .replace(/_+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

module.exports = {
  RESOURCE_TYPES,
  TYPE_LABELS,
  YEARS,
  SEMESTERS,
  UNIT_CODE_FORMAT,
  normalizeUnitCode,
  findUnitCodes,
  detectUnitCode,
  folderPath,
  titleFromFileName
};
