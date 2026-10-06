import { useState } from 'react';
import type { DocumentDto } from '@leandocs/shared';
import { useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api/client';
import { queryKeys, useTags } from '../api/queries';
import { useContentActions } from '../actions/ContentActions';
import { Button } from '../components/ui/Button';
import { FormError, TextField } from '../components/ui/Field';
import { TagInput } from '../components/ui/TagInput';
import { useNotify } from '../components/ui/Toast';
import { formatDate } from '../utils/format';

function list(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : typeof value === 'string'
      ? [value]
      : [];
}

interface Draft {
  title: string;
  description: string;
  tags: string[];
  aliases: string[];
}

function draftOf(document: DocumentDto): Draft {
  return {
    title: document.title,
    description:
      typeof document.frontmatter.description === 'string' ? document.frontmatter.description : '',
    tags: list(document.frontmatter.tags),
    aliases: list(document.frontmatter.aliases),
  };
}

const same = (a: string[], b: string[]) => a.join('\n') === b.join('\n');

/**
 * "Info" tab (UI_SPEC §46, §115): path, dates and the editable properties title, description,
 * tags and aliases. Path changes go through Move. Read-only while the document is being edited,
 * so a save here cannot conflict with the open editor.
 */
export function InfoPanel({ document, editing }: { document: DocumentDto; editing: boolean }) {
  const actions = useContentActions();
  const tags = useTags();
  const queryClient = useQueryClient();
  const notify = useNotify();
  const [base, setBase] = useState(document.revision);
  const [draft, setDraft] = useState<Draft>(() => draftOf(document));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  // A new revision (save elsewhere, reload) resets the form.
  if (base !== document.revision) {
    setBase(document.revision);
    setDraft(draftOf(document));
  }
  const original = draftOf(document);
  const dirty =
    draft.title.trim() !== original.title ||
    draft.description.trim() !== original.description ||
    !same(draft.tags, original.tags) ||
    !same(draft.aliases, original.aliases);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      const updated = await api.updateProperties(document.id, {
        expectedRevision: document.revision,
        ...(draft.title.trim() !== original.title ? { title: draft.title } : {}),
        ...(draft.description.trim() !== original.description
          ? { description: draft.description }
          : {}),
        ...(!same(draft.tags, original.tags) ? { tags: draft.tags } : {}),
        ...(!same(draft.aliases, original.aliases) ? { aliases: draft.aliases } : {}),
      });
      queryClient.setQueryData(queryKeys.document(document.id), updated);
      await Promise.all(
        [queryKeys.tree, queryKeys.tags, queryKeys.searches, queryKeys.links, queryKeys.recent].map(
          (queryKey) => queryClient.invalidateQueries({ queryKey }),
        ),
      );
      notify.info('Properties saved.');
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="info-panel"
      aria-label="Properties"
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !saving) void save();
      }}
    >
      <dl className="info-panel__facts">
        <dt>Path</dt>
        <dd>
          <code>{document.path}</code>{' '}
          <button
            type="button"
            className="info-panel__move"
            onClick={() =>
              actions.move({
                kind: 'document',
                id: document.id,
                title: document.title,
                path: document.path,
              })
            }
          >
            Move…
          </button>
        </dd>
        {document.created && (
          <>
            <dt>Created</dt>
            <dd>{formatDate(document.created)}</dd>
          </>
        )}
        {document.updated && (
          <>
            <dt>Updated</dt>
            <dd>{formatDate(document.updated)}</dd>
          </>
        )}
      </dl>
      {editing && (
        <p className="context__empty">Finish editing (Done) to change properties here.</p>
      )}
      <FormError message={error} />
      <TextField
        label="Title"
        value={draft.title}
        disabled={editing}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
      />
      <TextField
        label="Description"
        value={draft.description}
        disabled={editing}
        onChange={(event) => setDraft({ ...draft, description: event.target.value })}
      />
      <TagInput
        label="Tags"
        values={draft.tags}
        disabled={editing}
        suggestions={(tags.data?.items ?? []).map((tag) => tag.name)}
        onChange={(values) => setDraft({ ...draft, tags: values })}
      />
      <TagInput
        label="Aliases"
        values={draft.aliases}
        disabled={editing}
        onChange={(values) => setDraft({ ...draft, aliases: values })}
      />
      {!editing && (
        <div className="info-panel__actions">
          <Button size="small" type="submit" variant="primary" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save properties'}
          </Button>
          {dirty && (
            <Button size="small" variant="ghost" onClick={() => setDraft(original)}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
