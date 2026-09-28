'use client';

import { useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiArrowDown, HiArrowUp, HiDocumentText, HiEye, HiPencil, HiPlus, HiTrash, HiUpload, HiExclamation, HiCheckCircle, HiCollection,
} from 'react-icons/hi';
import { createConstitution, publishConstitution, updateConstitution } from '@/lib/api';
import { ACCEPTED_FILES, READABLE_EXTENSIONS, extensionOf, readDocument, splitIntoSections, sectionHeading } from '@/lib/constitution';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ConstitutionDocument from '@/components/constitution/ConstitutionDocument';

const MAX_BYTES = 20 * 1024 * 1024;

let keySeed = 0;
const withKey = (section) => ({ ...section, key: `s${(keySeed += 1)}` });
const stripKeys = (sections) => sections.map(({ number, title, body }) => ({ number: number.trim(), title: title.trim(), body: body.trim() }));

const STRATEGY_NOTES = {
  styles: 'using the headings in the Word file',
  article: 'at headings such as “Article 1” or “Chapter Two”',
  numbered: 'at numbered headings such as “1. NAME”',
  section: 'at headings such as “Section 1”',
  caps: 'at lines written in capitals',
};

const toDateInput = (value) => (value ? String(value).slice(0, 10) : '');

/**
 * Create or edit a version of the constitution.
 *
 * For a new version the administrator uploads the document, the browser
 * splits it into articles, and the administrator corrects the result. Every
 * article stays editable, and a preview shows exactly what the site will show.
 */
export default function ConstitutionEditor({ initial, onSaved, onCancel }) {
  const editing = Boolean(initial);
  const fileInputId = useId();
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [reading, setReading] = useState(null); // null | { page, pages }
  const [readNote, setReadNote] = useState(null);
  const [pending, setPending] = useState(null); // articles read from a replacement file, awaiting a decision
  const [meta, setMeta] = useState({
    title: initial?.title || '',
    version: initial?.version || '',
    adoptedOn: toDateInput(initial?.adoptedOn),
    summary: initial?.summary || '',
  });
  const [sections, setSections] = useState(() => (initial?.sections || []).map(withKey));
  const [view, setView] = useState('edit');
  const [saving, setSaving] = useState(null); // null | 'draft' | 'publish'
  const [progress, setProgress] = useState(0);

  const started = sections.length > 0;

  const applyReading = (result) => {
    setSections(result.sections.map(withKey));
    // Suggestions fill only what the administrator has not typed.
    setMeta((current) => ({
      ...current,
      title: current.title || result.title,
      version: current.version || result.version,
      adoptedOn: current.adoptedOn || result.adoptedOn,
    }));
  };

  const chooseFile = async (chosen) => {
    if (!chosen) return;
    if (chosen.size > MAX_BYTES) {
      toast.error('That file is larger than 20MB.');
      return;
    }
    setFile(chosen);
    setReadNote(null);

    if (!READABLE_EXTENSIONS.includes(extensionOf(chosen))) {
      setReadNote({ tone: 'warning', text: 'Older Word (.doc) files cannot be read here, so the file will be kept for download but the articles need adding by hand. Save it as PDF or .docx to have them filled in for you.' });
      if (!started) setSections([withKey({ number: '', title: 'Preamble', body: '' })]);
      return;
    }

    setReading({ page: 0, pages: 0 });
    try {
      const lines = await readDocument(chosen, { onProgress: setReading });
      const text = lines.map((line) => line.text || '').join('').trim();
      if (!text) {
        setReadNote({ tone: 'warning', text: 'No text was found in this file. It may be a scanned image. The file will be kept for download; add the articles by hand, or upload a version with selectable text.' });
        if (!started) setSections([withKey({ number: '', title: 'Preamble', body: '' })]);
        return;
      }

      const result = splitIntoSections(lines);
      const note = result.strategy === 'none'
        ? { tone: 'warning', text: 'No article headings were found, so the whole text is in one article. Split it by adding articles below, or check the document uses headings such as “Article 1”.' }
        : { tone: 'success', text: `Found ${result.sections.length} articles ${STRATEGY_NOTES[result.strategy]}. Check each one before publishing.` };

      if (started) {
        // Replacing the file of a version with articles: ask before overwriting edits.
        setPending({ result, note });
      } else {
        applyReading(result);
        setReadNote(note);
      }
    } catch (error) {
      setReadNote({ tone: 'warning', text: `${error.message || 'The file could not be read.'} The file will still be kept for download.` });
      if (!started) setSections([withKey({ number: '', title: 'Preamble', body: '' })]);
    } finally {
      setReading(null);
    }
  };

  const update = (key, field, value) => setSections((list) => list.map((s) => (s.key === key ? { ...s, [field]: value } : s)));
  const move = (index, delta) => setSections((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    return next;
  });
  const mergeUp = (index) => setSections((list) => {
    const next = [...list];
    const [item] = next.splice(index, 1);
    const target = next[index - 1];
    // The merged article's heading becomes a line of text, so nothing is lost.
    next[index - 1] = { ...target, body: [target.body, sectionHeading(item), item.body].filter((part) => part.trim()).join('\n') };
    return next;
  });
  const remove = (index) => setSections((list) => list.filter((_, i) => i !== index));
  const insertAfter = (index) => setSections((list) => {
    const next = [...list];
    next.splice(index + 1, 0, withKey({ number: '', title: '', body: '' }));
    return next;
  });

  const problems = [
    !meta.version.trim() && 'Give this version a number.',
    !sections.length && 'Add at least one article.',
    sections.some((s) => !s.title.trim()) && 'Every article needs a title.',
  ].filter(Boolean);

  const save = async (publish) => {
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setSaving(publish ? 'publish' : 'draft');
    setProgress(0);
    try {
      const fields = { ...meta, sections: stripKeys(sections) };
      let saved;
      if (editing && !file) {
        ({ constitution: saved } = await updateConstitution(initial._id, fields));
      } else {
        const form = new FormData();
        if (file) form.append('file', file);
        form.append('version', fields.version.trim());
        form.append('title', fields.title.trim());
        form.append('summary', fields.summary.trim());
        form.append('adoptedOn', fields.adoptedOn || '');
        form.append('sections', JSON.stringify(fields.sections));
        if (!editing) form.append('publish', String(publish));
        ({ constitution: saved } = editing
          ? await updateConstitution(initial._id, form)
          : await createConstitution(form, setProgress));
      }
      // A new version publishes as it is created; an existing draft is published after saving.
      if (publish && editing) ({ constitution: saved } = await publishConstitution(saved._id));
      onSaved(saved, { published: publish });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(null);
    }
  };

  const setField = (field) => (event) => setMeta((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-strong">{editing ? `Edit version ${initial.version}` : 'Upload a new version'}</h2>
          <p className="text-sm text-muted-fg mt-1">
            {editing ? 'Correct the articles or details. Published changes show on the site straight away.' : 'Upload the document and its articles are filled in for you to check.'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={onCancel} disabled={Boolean(saving)}>Cancel</button>
      </div>

      {/* The document */}
      <section className="card" aria-labelledby={`${fileInputId}-label`}>
        <h3 id={`${fileInputId}-label`} className="font-semibold text-strong mb-3">Document</h3>
        <input
          ref={fileInput}
          id={fileInputId}
          type="file"
          accept={ACCEPTED_FILES}
          className="sr-only"
          onChange={(e) => { chooseFile(e.target.files?.[0]); e.target.value = ''; }}
        />
        {reading ? (
          <div className="flex items-center gap-3 py-4" role="status">
            <span className="w-6 h-6 animate-spin rounded-full border-[3px] border-primary-500 border-t-transparent" aria-hidden="true" />
            <span className="text-sm text-body">
              Reading the document{reading.pages ? `: page ${reading.page} of ${reading.pages}` : '…'}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files?.[0]); }}
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed border-line-strong hover:border-primary-400 hover:bg-muted transition-colors text-left ${started || editing ? 'px-4 py-3' : 'w-full px-6 py-10 justify-center flex-col text-center'}`}
            >
              <HiUpload className={`${started || editing ? 'w-5 h-5' : 'w-10 h-10'} text-faint`} aria-hidden="true" />
              <span>
                <span className="block text-sm font-medium text-body">
                  {file ? file.name : editing ? (initial.file?.name ? `Replace ${initial.file.name}` : 'Attach the document') : 'Choose the constitution, or drag it here'}
                </span>
                {!started && !editing && <span className="block text-xs text-subtle mt-1">PDF, Word (.docx) or text, up to 20MB</span>}
              </span>
            </button>
            {!started && !editing && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setSections([withKey({ number: '', title: 'Preamble', body: '' })])}>
                Type it in without a file
              </button>
            )}
          </div>
        )}
        {readNote && (
          <p className={`mt-3 text-sm flex items-start gap-2 ${readNote.tone === 'success' ? 'text-success' : 'text-warning'}`} role="status">
            {readNote.tone === 'success' ? <HiCheckCircle className="w-5 h-5 shrink-0" aria-hidden="true" /> : <HiExclamation className="w-5 h-5 shrink-0" aria-hidden="true" />}
            {readNote.text}
          </p>
        )}
      </section>

      {started && (
        <>
          {/* Details */}
          <section className="card grid gap-4 sm:grid-cols-2" aria-label="Version details">
            <div className="sm:col-span-2">
              <label htmlFor="constitution-title" className="form-label">Title</label>
              <input id="constitution-title" className="input-field" maxLength={200} value={meta.title} onChange={setField('title')} placeholder="Constitution of the Egerton Engineering Student Association" />
            </div>
            <div>
              <label htmlFor="constitution-version" className="form-label">Version<span className="text-danger"> *</span></label>
              <input id="constitution-version" className="input-field" required maxLength={30} value={meta.version} onChange={setField('version')} placeholder="2.0" />
            </div>
            <div>
              <label htmlFor="constitution-adopted" className="form-label">Adopted on</label>
              <input id="constitution-adopted" type="date" className="input-field" value={meta.adoptedOn} onChange={setField('adoptedOn')} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="constitution-summary" className="form-label">Summary (optional)</label>
              <textarea id="constitution-summary" className="input-field" rows={2} maxLength={1000} value={meta.summary} onChange={setField('summary')} placeholder="What changed in this version, shown above the articles" />
            </div>
          </section>

          {/* Articles */}
          <section aria-labelledby="articles-heading">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h3 id="articles-heading" className="font-semibold text-strong">
                Articles <span className="text-subtle font-normal">({sections.length})</span>
              </h3>
              <div role="tablist" aria-label="Articles view" className="flex gap-1 bg-muted rounded-lg p-1">
                {[{ id: 'edit', label: 'Edit', icon: HiPencil }, { id: 'preview', label: 'Preview', icon: HiEye }].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={view === id}
                    onClick={() => setView(id)}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 ${view === id ? 'bg-surface text-strong shadow-card' : 'text-muted-fg hover:text-strong'}`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {view === 'preview' ? (
              <div className="card">
                <ConstitutionDocument sections={sections.filter((s) => s.title.trim())} />
              </div>
            ) : (
              <ol className="space-y-3">
                {sections.map((section, index) => (
                  <li key={section.key} className="card p-4">
                    <div className="flex flex-wrap items-start gap-2">
                      <span className="w-7 h-7 rounded-full bg-muted text-xs font-bold text-subtle flex items-center justify-center shrink-0 mt-1.5">{index + 1}</span>
                      <div className="w-32 shrink-0">
                        <label htmlFor={`${section.key}-number`} className="sr-only">Number of article {index + 1}</label>
                        <input id={`${section.key}-number`} className="input-field py-2" maxLength={20} value={section.number} onChange={(e) => update(section.key, 'number', e.target.value)} placeholder="Article I" />
                      </div>
                      <div className="flex-1 min-w-[10rem]">
                        <label htmlFor={`${section.key}-title`} className="sr-only">Title of article {index + 1}</label>
                        <input
                          id={`${section.key}-title`}
                          className="input-field py-2 font-semibold"
                          maxLength={200}
                          value={section.title}
                          onChange={(e) => update(section.key, 'title', e.target.value)}
                          placeholder="Title, e.g. Membership"
                          aria-invalid={!section.title.trim()}
                        />
                      </div>
                      <div className="flex gap-0.5 shrink-0">
                        <button type="button" className="p-2 rounded-lg text-subtle hover:text-strong hover:bg-muted disabled:opacity-30" onClick={() => move(index, -1)} disabled={index === 0} title="Move up" aria-label={`Move article ${index + 1} up`}>
                          <HiArrowUp className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="p-2 rounded-lg text-subtle hover:text-strong hover:bg-muted disabled:opacity-30" onClick={() => move(index, 1)} disabled={index === sections.length - 1} title="Move down" aria-label={`Move article ${index + 1} down`}>
                          <HiArrowDown className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="p-2 rounded-lg text-subtle hover:text-strong hover:bg-muted disabled:opacity-30" onClick={() => mergeUp(index)} disabled={index === 0} title="Join to the article above" aria-label={`Join article ${index + 1} to the one above`}>
                          <HiCollection className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button type="button" className="p-2 rounded-lg text-subtle hover:text-danger hover:bg-danger-soft disabled:opacity-30" onClick={() => remove(index)} disabled={sections.length === 1} title="Delete" aria-label={`Delete article ${index + 1}`}>
                          <HiTrash className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                    <label htmlFor={`${section.key}-body`} className="sr-only">Text of article {index + 1}</label>
                    <textarea
                      id={`${section.key}-body`}
                      className="input-field mt-3 text-sm leading-relaxed font-mono"
                      rows={Math.min(16, Math.max(4, section.body.split('\n').length + 1))}
                      value={section.body}
                      onChange={(e) => update(section.key, 'body', e.target.value)}
                      placeholder="One clause per line, e.g. 1.1 The association shall be called…"
                    />
                    <button type="button" className="btn-ghost btn-sm mt-2 -ml-2" onClick={() => insertAfter(index)}>
                      <HiPlus className="w-4 h-4" aria-hidden="true" /> Add an article below
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Actions */}
          <div className="card flex flex-col sm:flex-row sm:items-center gap-3 sticky bottom-20 lg:bottom-4 z-10 shadow-overlay">
            <p className="text-sm text-muted-fg flex-1 flex items-center gap-2">
              <HiDocumentText className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
              {problems[0] || `${sections.length} articles ready${file ? ` · ${file.name}` : ''}`}
            </p>
            <div className="flex flex-col-reverse sm:flex-row gap-2">
              <button type="button" className="btn-ghost" onClick={() => save(false)} disabled={Boolean(saving)}>
                {saving === 'draft' ? (progress ? `Saving… ${progress}%` : 'Saving…') : editing ? 'Save changes' : 'Save as draft'}
              </button>
              {(!editing || initial.status !== 'published') && (
                <button type="button" className="btn-primary" onClick={() => save(true)} disabled={Boolean(saving)}>
                  {saving === 'publish' ? (progress ? `Publishing… ${progress}%` : 'Publishing…') : editing ? 'Save and publish' : 'Publish'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Replace the articles?"
        description={pending ? `${pending.note.text} Replacing discards the articles below, including any corrections you made.` : ''}
        confirmLabel="Use the new articles"
        cancelLabel="Keep my articles"
        onConfirm={() => { applyReading(pending.result); setReadNote(pending.note); setPending(null); }}
        onCancel={() => { setReadNote({ tone: 'success', text: 'The new file will replace the original. Your articles are unchanged.' }); setPending(null); }}
      />
    </div>
  );
}
