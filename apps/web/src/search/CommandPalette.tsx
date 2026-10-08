import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SnippetPart } from '@leandocs/shared';
import { FileIcon, SearchIcon } from '../components/icons';
import { Dialog as RadixDialog } from 'radix-ui';
import { useNavigate } from 'react-router';
import { errorMessage } from '../api/client';
import { useRecentDocuments, useSearch, useTree } from '../api/queries';
import { displayFolder, parentPath } from '../utils/format';
import { allDocuments, quickOpen } from './quick-open';
import './search.css';

export type PaletteMode = 'search' | 'open';

interface PaletteItem {
  id: string;
  title: string;
  path: string;
  snippet?: SnippetPart[];
}

const LIMIT = 20;
const DEBOUNCE_MS = 150;
const FILTER = /(?:^|\s)(tag|path|title):("[^"]*"?|\S+)/gi;

/** Recognised §33 filters, shown as subtle tokens (UI_SPEC §62). */
function filtersOf(query: string): { key: string; value: string }[] {
  return [...query.matchAll(FILTER)]
    .map((match) => ({
      key: match[1]!.toLowerCase(),
      value: match[2]!.replace(/^"|"$/g, ''),
    }))
    .filter((filter) => filter.value !== '');
}

function useDebounced(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Command palette (UI_SPEC §59–63): full-text search with snippets, or quick open by title and
 * path. Keyboard: ↑ ↓ to move, Enter to open, Esc to close; Ctrl/Cmd+K and +P switch mode.
 */
export function CommandPalette({
  mode,
  initialQuery = '',
  onModeChange,
  onClose,
}: {
  mode: PaletteMode;
  /** Prefilled query, e.g. `tag:docker ` from a tag (P10-03). */
  initialQuery?: string;
  onModeChange: (mode: PaletteMode) => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  // The highlighted row belongs to one result list; a new list starts at its first row.
  const [selection, setSelection] = useState<{ items: unknown; index: number }>({
    items: undefined,
    index: 0,
  });
  const listRef = useRef<HTMLUListElement>(null);
  const debounced = useDebounced(query, DEBOUNCE_MS);
  const trimmed = query.trim();

  const tree = useTree();
  const recent = useRecentDocuments();
  const search = useSearch(mode === 'search' ? debounced : '', LIMIT);

  const items: PaletteItem[] = useMemo(() => {
    if (trimmed === '') return (recent.data?.items ?? []).slice(0, LIMIT);
    if (mode === 'open') return tree.data ? quickOpen(allDocuments(tree.data), trimmed, LIMIT) : [];
    return search.data?.results ?? [];
  }, [mode, trimmed, recent.data, tree.data, search.data]);

  const active = selection.items === items ? selection.index : 0;
  const setActive = (index: number) => setSelection({ items, index });
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const open = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(`/doc/${encodeURIComponent(item.id)}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      open(items[active]);
    }
  };

  const searching = mode === 'search' && trimmed !== '';
  const waiting =
    searching && (debounced.trim() !== trimmed || (search.isFetching && !search.data));
  const filters = mode === 'search' ? filtersOf(query) : [];
  const title = mode === 'search' ? 'Search documentation' : 'Open document';
  const status =
    searching && search.isError
      ? `Search is unavailable: ${errorMessage(search.error)}`
      : waiting && items.length === 0
        ? 'Searching…'
        : undefined;

  return (
    <RadixDialog.Root open onOpenChange={(next) => !next && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="dialog-overlay" />
        <RadixDialog.Content className="palette" aria-describedby={undefined}>
          <RadixDialog.Title className="visually-hidden">{title}</RadixDialog.Title>
          <div className="palette__field">
            {mode === 'search' ? (
              <SearchIcon size={16} aria-hidden="true" />
            ) : (
              <FileIcon size={16} aria-hidden="true" />
            )}
            <input
              className="palette__input"
              role="combobox"
              aria-label={title}
              aria-expanded={items.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
              placeholder={mode === 'search' ? 'Search documentation…' : 'Open document by name…'}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            <div className="palette__modes" role="group" aria-label="Mode">
              <button
                type="button"
                className="palette__mode"
                aria-pressed={mode === 'search'}
                onClick={() => onModeChange('search')}
              >
                Search
              </button>
              <button
                type="button"
                className="palette__mode"
                aria-pressed={mode === 'open'}
                onClick={() => onModeChange('open')}
              >
                Open
              </button>
            </div>
          </div>

          {filters.length > 0 && (
            <div className="palette__filters" role="group" aria-label="Filters">
              {filters.map((filter, index) => (
                <span key={index} className="palette__filter">
                  {filter.key}: <strong>{filter.value}</strong>
                </span>
              ))}
            </div>
          )}

          {trimmed === '' && items.length > 0 && <div className="palette__section">Recent</div>}

          <ul
            className="palette__list"
            id={listId}
            role="listbox"
            aria-label="Results"
            ref={listRef}
          >
            {items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                className="palette__item"
                onMouseMove={() => setActive(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => open(item)}
              >
                <span className="palette__title">{item.title}</span>
                <span className="palette__path">{displayFolder(parentPath(item.path))}</span>
                {mode === 'search' && item.snippet && item.snippet.length > 0 && (
                  <span className="palette__snippet">
                    {item.snippet.map((part, partIndex) =>
                      part.match ? <mark key={partIndex}>{part.text}</mark> : part.text,
                    )}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {status && (
            <p className="palette__status" role="status">
              {status}
            </p>
          )}
          {trimmed !== '' && items.length === 0 && !waiting && !search.isError && (
            <div className="palette__empty" role="status">
              <p>No results for “{trimmed}”</p>
              <p className="palette__hint">
                {mode === 'search'
                  ? 'Try another phrase or check your filters.'
                  : 'Try another name, or search the full text instead.'}
              </p>
            </div>
          )}
          {trimmed === '' && items.length === 0 && (
            <p className="palette__status">
              {mode === 'search'
                ? 'Type to search titles, headings, tags and text. Filters: tag:, path:, title:'
                : 'Type part of a document name or path.'}
            </p>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
