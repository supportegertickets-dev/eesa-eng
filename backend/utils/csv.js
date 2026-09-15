/**
 * CSV output for spreadsheet exports.
 */

// A cell starting with one of these runs as a formula when the file is opened
// in Excel or Google Sheets, so a member named "=HYPERLINK(...)" could plant a
// link in an administrator's spreadsheet.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const cell = (value) => {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * @param {Array<{ label: string, value: (row: object) => unknown }>} columns
 * @param {object[]} rows
 */
const toCsv = (columns, rows) => {
  const lines = [columns.map((column) => cell(column.label)).join(',')];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(','));
  // The byte-order mark makes Excel read the file as UTF-8, so accented names survive.
  return `﻿${lines.join('\r\n')}\r\n`;
};

module.exports = { toCsv };
