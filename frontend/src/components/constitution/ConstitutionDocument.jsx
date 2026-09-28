import { Fragment } from 'react';
import { CLAUSE_MARKER, clauseLevel, sectionAnchor, sectionHeading } from '@/lib/constitution';

const INDENT = ['', 'ml-5 sm:ml-8', 'ml-10 sm:ml-16', 'ml-14 sm:ml-24'];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Text with every match of the search term marked. */
function Highlight({ text, query }) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, 'ig'));
  return parts.map((part, index) => (index % 2 === 1
    ? <mark key={index} className="bg-accent-200 dark:bg-accent-500/40 text-inherit rounded px-0.5">{part}</mark>
    : <Fragment key={index}>{part}</Fragment>));
}

/** One paragraph; numbered clauses hang their number and indent by depth. */
function Clause({ text, query }) {
  const match = text.match(CLAUSE_MARKER);
  if (!match) {
    return <p className="text-body leading-relaxed"><Highlight text={text} query={query} /></p>;
  }
  const marker = match[1];
  return (
    <p className={`grid grid-cols-[auto_1fr] gap-x-2 text-body leading-relaxed ${INDENT[clauseLevel(marker)] || INDENT[1]}`}>
      <span className="font-semibold text-strong tabular-nums">{marker}</span>
      <span><Highlight text={text.slice(match[0].length)} query={query} /></span>
    </p>
  );
}

/**
 * The constitution's articles as a readable document. Each article has an
 * anchor, so the contents list and shared links can jump straight to it.
 */
export default function ConstitutionDocument({ sections, query = '', indexOf }) {
  return (
    <div className="space-y-10">
      {sections.map((section, position) => {
        // When the list is filtered, anchors still use the article's place in the whole document.
        const index = indexOf ? indexOf(section) : position;
        return (
          <section key={`${index}-${section.title}`} id={sectionAnchor(section, index)} className="scroll-mt-36 break-inside-avoid-page">
            <h2 className="font-heading text-xl sm:text-2xl font-bold text-strong mb-4 pb-2 border-b border-line">
              <Highlight text={sectionHeading(section)} query={query} />
            </h2>
            <div className="space-y-3">
              {section.body
                ? section.body.split('\n').filter((line) => line.trim()).map((line, i) => <Clause key={i} text={line} query={query} />)
                : <p className="text-subtle italic">No text.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
