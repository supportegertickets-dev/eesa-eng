/**
 * Library helpers shared by the browse, upload, review and unit pages.
 * The unit-code rules mirror backend/utils/library.js.
 */

export const RESOURCE_TYPES = ['notes', 'past-papers', 'textbooks', 'tutorials', 'lab-reports', 'other'];

export const TYPE_LABELS = {
  notes: 'Lecture notes',
  'past-papers': 'Past papers',
  textbooks: 'Textbooks',
  tutorials: 'Tutorials & assignments',
  'lab-reports': 'Lab reports',
  other: 'Other',
};

export const YEARS = [1, 2, 3, 4, 5];
export const SEMESTERS = [1, 2];

export const MAX_FILE_BYTES = 20 * 1024 * 1024; // Matches the API's limit.
export const MAX_FILES_PER_UPLOAD = 10;

export const STATUS_BADGES = { pending: 'badge-warning', approved: 'badge-success', rejected: 'badge-danger' };
export const STATUS_LABELS = { pending: 'Awaiting review', approved: 'Published', rejected: 'Not approved' };

/* ------------------------------------------------------------------ *
 * Files
 * ------------------------------------------------------------------ */

const KIND_BY_EXTENSION = {
  pdf: 'pdf',
  doc: 'word',
  docx: 'word',
  ppt: 'slides',
  pptx: 'slides',
  xls: 'sheet',
  xlsx: 'sheet',
  txt: 'text',
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
};

const KIND_BY_TYPE = {
  'application/pdf': 'pdf',
  'application/msword': 'word',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
  'application/vnd.ms-powerpoint': 'slides',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'slides',
  'application/vnd.ms-excel': 'sheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'sheet',
  'text/plain': 'text',
};

export const KIND_STYLES = {
  pdf: { label: 'PDF', className: 'bg-red-500/10 text-red-600 dark:text-red-300' },
  word: { label: 'Word', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-300' },
  slides: { label: 'PowerPoint', className: 'bg-orange-500/10 text-orange-600 dark:text-orange-300' },
  sheet: { label: 'Excel', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
  image: { label: 'Image', className: 'bg-purple-500/10 text-purple-600 dark:text-purple-300' },
  text: { label: 'Text', className: 'bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  file: { label: 'File', className: 'bg-muted text-muted-fg' },
};

export const extensionOf = (name = '') => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

export const ACCEPT_ATTRIBUTE = Object.keys(KIND_BY_EXTENSION).map((ext) => `.${ext}`).join(',');

/** 'pdf' | 'word' | 'slides' | 'sheet' | 'image' | 'text' | 'file' */
export const fileKind = ({ type, name } = {}) => {
  if (type?.startsWith('image/')) return 'image';
  return KIND_BY_TYPE[type] || KIND_BY_EXTENSION[extensionOf(name)] || 'file';
};

export const resourceKind = (resource) => fileKind({ type: resource.fileType, name: resource.originalFileName });

export const formatBytes = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Check a file before uploading, so a wrong type or an oversized file is
 * reported at once rather than after a slow upload fails.
 * @returns {string|null} an error message, or null when the file is acceptable
 */
export const validateLibraryFile = (file) => {
  if (!KIND_BY_EXTENSION[extensionOf(file.name)]) {
    return `"${file.name}" is not a supported file. Use PDF, Word, PowerPoint, Excel, text or an image.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. Files must be ${formatBytes(MAX_FILE_BYTES)} or smaller.`;
  }
  return null;
};

/** "EEEN_481-notes.pdf" -> "EEEN 481-notes" */
export const titleFromFileName = (name = '') => name
  .replace(/\.[^.]+$/, '')
  .replace(/_+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/* ------------------------------------------------------------------ *
 * Unit codes
 * ------------------------------------------------------------------ */

const NOT_UNIT_PREFIXES = new Set([
  'PAGE', 'PAGES', 'PG', 'PP', 'YEAR', 'YEARS', 'YR', 'ROOM', 'RM', 'BOX', 'FIG', 'FIGURE',
  'TABLE', 'NO', 'NUM', 'TEL', 'FAX', 'ISBN', 'ISSN', 'ISO', 'IEEE', 'IEC', 'VOL', 'CHAPTER',
  'CH', 'SECTION', 'SEC', 'SEM', 'LEVEL', 'CLASS', 'GROUP', 'PART', 'STEP', 'UNIT', 'CODE',
  'EXAM', 'CAT', 'QUIZ', 'TEST', 'LAB', 'IMG', 'DSC', 'SCAN', 'DOC', 'FILE', 'COPY', 'PHOTO',
  'VID', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'SEPT', 'OCT', 'NOV',
  'DEC', 'MARCH', 'APRIL', 'JUNE', 'JULY', 'AUGUST', 'TIME', 'DATE', 'HRS', 'MIN', 'MINS',
  'AM', 'PM', 'KES', 'KSH', 'USD', 'MARKS', 'TOTAL', 'SIZE', 'NOTE', 'NOTES', 'QN', 'WEEK',
  'DAY', 'TERM', 'ROUND', 'BATCH', 'SERIES', 'MODEL', 'TYPE', 'REV', 'VER', 'ED', 'EDITION',
]);

const CODE_IN_TEXT = /(?:^|[^A-Z0-9])([A-Z]{2,6})[ \t_-]{0,3}(\d{3,4})(?![A-Z0-9])/g;

/** "eeen481" and "EEEN-481" become "EEEN 481"; anything else is null. */
export const normalizeUnitCode = (value) => {
  const match = String(value || '').toUpperCase().trim().match(/^([A-Z]{2,6})[\s_-]*(\d{3,4})$/);
  return match ? `${match[1]} ${match[2]}` : null;
};

/** Every distinct unit code mentioned in some text, in order of appearance. */
export const findUnitCodes = (text = '') => {
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

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

export const unitTitle = (unit) => (unit?.name ? `${unit.code} · ${unit.name}` : unit?.code || 'No unit');

export const placementLabel = ({ year, semester } = {}) =>
  (year ? `Year ${year} · Semester ${semester}` : 'Other units');

/**
 * Group units into Year › Semester folders with file totals at each level.
 * Units without a year are service or elective units, listed under "Other".
 */
export const buildFolderTree = (units = []) => {
  const years = YEARS.map((year) => ({
    year,
    total: 0,
    unitCount: 0,
    semesters: SEMESTERS.map((semester) => ({ semester, total: 0, units: [] })),
  }));
  const other = { total: 0, units: [] };

  for (const unit of units) {
    const files = unit.files?.total || 0;
    const year = years[unit.year - 1];
    if (!year || !unit.semester) {
      other.units.push(unit);
      other.total += files;
      continue;
    }
    const semester = year.semesters[unit.semester - 1];
    semester.units.push(unit);
    semester.total += files;
    year.total += files;
    year.unitCount += 1;
  }

  return { years, other };
};

export const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ *
 * Links
 * ------------------------------------------------------------------ */

/** A browse URL. Folder state lives in the query string so Back and shared links work. */
export const libraryHref = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '' && value !== false) search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `/portal/library?${query}` : '/portal/library';
};

export const unitHref = (unit, extra = {}) => libraryHref(unit?.year
  ? { year: unit.year, semester: unit.semester, unit: unit.code, ...extra }
  : { other: 1, unit: unit?.code, ...extra });

/* ------------------------------------------------------------------ *
 * Filing details (upload and edit forms)
 * ------------------------------------------------------------------ */

const isBlank = (value) => value === '' || value === null || value === undefined;

/** True when the details name a unit code the library does not have yet. */
export const isNewUnit = (details, units = []) => {
  const code = normalizeUnitCode(details.unitCode);
  return Boolean(code && !details.unitId && !units.some((unit) => unit.code === code));
};

/** Field problems in a file's details, keyed by field; empty when it can be saved. */
export const filingProblems = (details, units = []) => {
  const problems = {};
  if (!details.title?.trim()) problems.title = 'Add a title.';
  if (!details.unitId && !normalizeUnitCode(details.unitCode)) {
    problems.unit = 'Choose the unit this file belongs to, or type its code (for example EEEN 481).';
  } else if (isNewUnit(details, units) && isBlank(details.year) !== isBlank(details.semester)) {
    problems.unit = 'Choose both a year and a semester for the new unit, or leave both empty.';
  }
  return problems;
};
