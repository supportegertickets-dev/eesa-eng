/**
 * Checks on the details people type about themselves: names, usernames, bios,
 * email addresses and registration numbers.
 *
 * Every new account is also approved by an administrator before it can sign
 * in. These checks turn away the obvious junk at the door (profanity, keyboard
 * mashing, placeholder names) so the approval queue is left with judgement
 * calls. They are deliberately conservative: a real student turned away by a
 * false positive is worse than a troll who reaches the approval queue.
 */

/* ------------------------------------------------------------------ *
 * Registration numbers
 * ------------------------------------------------------------------ */

// Faculty of Engineering numbers: B and a programme code, a five-digit serial
// and the two-digit year of admission.
const REG_NUMBER_PATTERN = /^B\d{2}\/\d{5}\/\d{2}$/;
const REG_NUMBER_EXAMPLE = 'B12/12345/21';

/** Upper case with no spaces, and a hyphen or backslash typed for a slash put right. */
const normalizeRegNumber = (value) => String(value ?? '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '')
  .replace(/[\\-]/g, '/');

/* ------------------------------------------------------------------ *
 * Word lists
 * ------------------------------------------------------------------ */

// Offensive even inside a longer word, so "fuckoff" and "xbitchx" are caught.
// Only roots that never occur inside real names belong here: "shit" would
// reject Shitanda and "cock" would reject Hancock, so those are whole words.
const OFFENSIVE_FRAGMENTS = [
  'fuck', 'fvck', 'phuck', 'motherf', 'bitch', 'cunt', 'nigger', 'nigga', 'whore', 'dildo', 'wanker',
  'asshole', 'arsehole', 'dickhead', 'shithead', 'bullshit', 'dumbass', 'jackass', 'faggot',
  'kumamako', 'kumanyoko', 'kumamayo'
];

// Vulgar or a slur as a whole word, in English, Swahili and Sheng. Checked in
// bios too, so words with an innocent everyday sense ("nazi" is Swahili for
// coconut) stay out of it.
const OFFENSIVE_WORDS = new Set([
  'shit', 'shits', 'shitty', 'cock', 'cocks', 'ass', 'arse', 'slut', 'sluts', 'fag', 'fags', 'twat', 'prick',
  'pussy', 'boobs', 'tits', 'titties', 'porn', 'porno', 'bastard', 'bastards', 'retard', 'retarded',
  'kuma', 'mboro', 'mkundu', 'matako', 'malaya', 'msenge', 'wasenge', 'mavi', 'nyoko'
]);

// Fine in a bio, but never somebody's name: insults, crude words and the
// placeholders people type to get past a form.
const NOT_A_NAME = new Set([
  'idiot', 'stupid', 'dumb', 'moron', 'fool', 'loser', 'useless', 'nonsense', 'rubbish', 'trash', 'clown',
  'crap', 'piss', 'sex', 'sexy', 'penis', 'vagina', 'rape', 'rapist', 'hitler',
  'shenzi', 'mshenzi', 'washenzi', 'mjinga', 'wajinga', 'pumbavu', 'mpumbavu', 'fala', 'mafala', 'kichaa', 'takataka',
  'test', 'tester', 'testing', 'fake', 'dummy', 'sample', 'example', 'none', 'null', 'undefined', 'nobody',
  'anonymous', 'anon', 'unknown', 'noname', 'nameless', 'xxx', 'xyz', 'abc', 'abcd', 'asdf', 'qwerty',
  'admin', 'administrator'
]);

// Runs of neighbouring keys, the signature of a mashed keyboard. None occurs
// in a real name ("erty" would, in Liberty, so it is left out).
const KEYBOARD_RUNS = [
  'qwer', 'rtyu', 'tyui', 'yuio', 'uiop', 'asdf', 'sdfg', 'dfgh', 'fghj', 'ghjk', 'hjkl',
  'zxcv', 'xcvb', 'cvbn', 'vbnm', 'jkjk', 'kjkj', 'hjhj', 'jhjh', 'gjgj'
];

/* ------------------------------------------------------------------ *
 * Normalisation
 * ------------------------------------------------------------------ */

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i' };

/** Lower case with accents removed, so "Fück" reads as "fuck". */
const fold = (value) => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * The words in a piece of text, lower case and letters only. Look-alike digits
 * and symbols are read as letters, but only inside a word that already has a
 * letter, so "sh1t" is caught while a year such as 2005 is left alone.
 */
const wordsOf = (value) => fold(value)
  .split(/[\s._\-/,;:()"'’]+/)
  .map((word) => (/\p{L}/u.test(word) ? word.replace(/[0134578@$!|]/g, (ch) => LEET[ch]) : word))
  .map((word) => word.replace(/[^\p{L}]/gu, ''))
  .filter(Boolean);

const hasFragment = (letters) => OFFENSIVE_FRAGMENTS.some((fragment) => letters.includes(fragment));

/**
 * Whether text contains something offensive, as a whole word or a fragment.
 * `joined` also runs the words together to catch "f u c k" and "dick.head";
 * it is off for prose, where "basic until" would read as a slur.
 */
const isOffensive = (value, { joined = true } = {}) => {
  const words = wordsOf(value);
  return words.some((word) => OFFENSIVE_WORDS.has(word) || hasFragment(word))
    || (joined && hasFragment(words.join('')));
};

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

// Letters in any script, with spaces, apostrophes, hyphens and full stops
// between them: Wanjiru, O'Brien, Nyambura-Kamau, Ng'ang'a, St. John.
const NAME_CHARACTERS = /^\p{L}[\p{L}\p{M} '’.-]*$/u;

/** Whether a name looks like a mashed keyboard rather than a name. */
const looksMashed = (name) => {
  const letters = fold(name).replace(/[^a-z]/g, '');
  if (/(.)\1\1/.test(letters)) return true;
  if (KEYBOARD_RUNS.some((run) => letters.includes(run))) return true;
  // Checked only for names written wholly in the Latin alphabet, since the
  // vowel rules mean nothing in other scripts.
  if (letters.length === fold(name).replace(/[\s'’.-]/g, '').length) {
    if (/[bcdfghjklmnpqrstvwxz]{5}/.test(letters)) return true;
    if (letters.length >= 4 && !/[aeiouy]/.test(letters)) return true;
  }
  return false;
};

/**
 * What is wrong with a first or last name, or null if it is acceptable.
 * @param {string} value the name, already trimmed
 * @param {string} label "First name" or "Last name", for the message
 */
const nameProblem = (value, label) => {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  const realName = `Enter your real ${label.toLowerCase()}, as it appears on your student ID.`;

  if (!NAME_CHARACTERS.test(name)) return `${label} may only contain letters, spaces, apostrophes and hyphens.`;
  if ((name.match(/\p{L}/gu) || []).length < 2) return `${label} must have at least two letters.`;
  if (isOffensive(name)) return realName;
  if (wordsOf(name).some((word) => NOT_A_NAME.has(word))) return realName;
  if (looksMashed(name)) return realName;
  return null;
};

/** The same name typed twice, as in "Fuck Fuck" or "Test Test". */
const sameName = (first, last) => {
  const a = fold(first).replace(/[^\p{L}]/gu, '');
  return Boolean(a) && a === fold(last).replace(/[^\p{L}]/gu, '');
};

const SAME_NAME_MESSAGE = 'Your first and last names are the same. Enter both of your names.';

/* ------------------------------------------------------------------ *
 * Usernames, bios and email addresses
 * ------------------------------------------------------------------ */

const usernameProblem = (value) => {
  if (isOffensive(value)) return 'That username is not allowed. Choose another.';
  if (wordsOf(value).some((word) => NOT_A_NAME.has(word))) return 'That username is reserved. Choose another.';
  return null;
};

const bioProblem = (value) => (isOffensive(value, { joined: false }) ? 'Your bio contains language that is not allowed here.' : null);

// Inboxes that anyone can read, used to sign up without a real address.
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com',
  'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'throwawaymail.com', 'yopmail.com',
  'yopmail.net', 'trashmail.com', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc',
  'mailnesia.com', 'mintemail.com', 'fakeinbox.com', 'emailondeck.com', 'moakt.com', 'mohmal.com',
  'burnermail.io', 'spamgourmet.com', 'mytemp.email', 'tmpmail.org', 'tmail.ws', '1secmail.com'
]);

const emailProblem = (value) => {
  const [local = '', domain = ''] = String(value ?? '').toLowerCase().split('@');
  if (DISPOSABLE_DOMAINS.has(domain)) return 'Use an email address you will keep. Temporary inboxes are not accepted.';
  if (isOffensive(local)) return 'That email address is not accepted. Use your personal or student email.';
  return null;
};

/* ------------------------------------------------------------------ *
 * express-validator adapters
 * ------------------------------------------------------------------ */

/** Turn a problem function into a custom validator that reports the problem. */
const asValidator = (problem) => (value) => {
  const message = problem(value);
  if (message) throw new Error(message);
  return true;
};

const nameValidator = (label) => asValidator((value) => nameProblem(value, label));

module.exports = {
  REG_NUMBER_PATTERN,
  REG_NUMBER_EXAMPLE,
  normalizeRegNumber,
  isOffensive,
  nameProblem,
  sameName,
  SAME_NAME_MESSAGE,
  usernameProblem,
  bioProblem,
  emailProblem,
  nameValidator,
  usernameValidator: asValidator(usernameProblem),
  bioValidator: asValidator(bioProblem),
  emailValidator: asValidator(emailProblem)
};
