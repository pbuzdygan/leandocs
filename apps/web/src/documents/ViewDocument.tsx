import { useCallback, useEffect, useState } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useNavigate } from 'react-router';
import { DraftNotice } from '../editor/DraftNotice';
import { localDraftStore, type Draft } from '../editor/drafts';
import { HastContent } from '../markdown/MarkdownView';
import { SourceView } from '../markdown/SourceView';
import { Tab, TabPanel, Tabs, TabsList } from '../components/ui/Tabs';
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

  const actions = (
    <>
      <div className="doc__modes">
        <TabsList label="Document mode">
          <Tab value="view">View</Tab>
          <Tab value="source">Source</Tab>
        </TabsList>
        {/* Edit opens the editor route, so it is a button next to the tabs, not a tab. */}
        <button
          type="button"
          className="tabs__tab"
          onClick={edit}
          disabled={readOnly}
          title={readOnly ? 'This file is not UTF-8 text and cannot be edited here' : undefined}
          aria-keyshortcuts="Control+E Meta+E"
        >
          Edit
        </button>
      </div>
      <MoreMenu document={document} />
    </>
  );
  // A document read as plain text shows its source in both tabs (ADR-0025).
  const body = document.analysisLimited ? <SourceView source={document.content} plain /> : null;

  return (
    <Tabs className="tabs-root" value={mode} onValueChange={(value) => setMode(value as ViewMode)}>
      <DocumentLayout
        document={document}
        headings={rendered.headings}
        attachmentRefs={rendered.attachmentRefs}
        actions={actions}
      >
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
        <TabPanel value="view" className={body ? undefined : 'doc__body markdown'}>
          {body ??
            (document.content.trim() === '' ? (
              <p className="doc__empty">This document is empty.</p>
            ) : (
              <HastContent tree={rendered.tree} />
            ))}
        </TabPanel>
        <TabPanel value="source">{body ?? <SourceView source={document.content} />}</TabPanel>
      </DocumentLayout>
    </Tabs>
  );
}
