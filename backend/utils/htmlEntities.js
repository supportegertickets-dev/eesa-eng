/**
 * Decoder for text mangled by the old input-escaping sanitiser.
 *
 * Routes used to run express-validator's `.escape()` on free text, which
 * HTML-encodes on the way in and so corrupted stored values ("O'Brien" became
 * "O&#x27;Brien"). Escaping now happens at render time instead; this decodes
 * the rows written while the old behaviour was in force.
 */

const ENTITIES = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&#x2F;': '/',
  '&#47;': '/',
  '&#96;': '`',
  '&#x60;': '`',
  '&nbsp;': ' '
};

/**
 * Decode one round of escaping.
 *
 * `&amp;` is handled last so a double-escaped value unwinds one layer per run
 * rather than collapsing "&amp;lt;" straight to "<".
 */
const decodeEntities = (value) => {
  if (typeof value !== 'string' || !value.includes('&')) return value;

  let out = value;
  for (const [entity, char] of Object.entries(ENTITIES)) {
    out = out.split(entity).join(char);
  }
  return out.split('&amp;').join('&');
};

module.exports = { decodeEntities, ENTITIES };
