import { useCallback, useEffect, useState } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useNavigate } from 'react-router';
import { DraftNotice } from '../editor/DraftNotice';
import { localDraftStore, type Draft } from '../editor/drafts';
import { HastContent } from '../markdown/MarkdownView';
import { SourceView } from '../markdown/SourceView';
import { DocumentLayout } from './DocumentLayout';
import { docUrl, MoreMenu, useRendered, useToggleShortcut } from './document-utils';

type ViewMode = 'view' | 'source';

export function ViewDocument({ document }: { document: DocumentDto }) {
  const [mode, setMode] = useState<ViewMode>('view');
  const navigate = useNavigate();
  const rendered = useRendered(document);
  const [draft, setDraft] = useState<Draft | undefined>(() => {
    const stored = localDraftStore.get(document.id);
    return stored && stored.content !== document.content ? stored : undefined;
  });
  const readOnly = Boolean(document.notUtf8);
  const edit = useCallback(() => {
    if (!readOnly) void navigate(docUrl(document.id, true));
  }, [navigate, document.id, readOnly]);
  useToggleShortcut(edit);

  // Jump to `#heading` from links like [[Doc#Heading]] once the content is rendered.
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) window.document.getElementById(hash)?.scrollIntoView({ block: 'start' });
  }, [rendered]);

  const tabs = (
    <>
      <div className="doc__tabs" role="tablist" aria-label="Document mode">
        {(['view', 'source'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            className="doc__tab"
            onClick={() => setMode(value)}
          >
            {value === 'view' ? 'View' : 'Source'}
          </button>
        ))}
        <button
          type="button"
          role="tab"
          aria-selected={false}
          className="doc__tab"
          onClick={edit}
          disabled={readOnly}
          title={readOnly ? 'This file is not UTF-8 text and cannot be edited here' : undefined}
        >
          Edit
        </button>
      </div>
      <MoreMenu document={document} />
    </>
  );

  return (
    <DocumentLayout document={document} headings={rendered.headings} actions={tabs}>
      {draft && (
        <DraftNotice
          draft={draft}
          restoreLabel="Continue editing"
          onRestore={edit}
          onDiscard={() => {
            localDraftStore.remove(document.id);
            setDraft(undefined);
          }}
        />
      )}
      {document.analysisLimited ? (
        <div role="tabpanel">
          <SourceView source={document.content} plain />
        </div>
      ) : mode === 'view' ? (
        <div className="doc__body markdown" role="tabpanel">
          {document.content.trim() === '' ? (
            <p className="doc__empty">This document is empty.</p>
          ) : (
            <HastContent tree={rendered.tree} />
          )}
        </div>
      ) : (
        <div role="tabpanel">
          <SourceView source={document.content} />
        </div>
      )}
    </DocumentLayout>
  );
}
