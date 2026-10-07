import { useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import { IconButton } from '../components/ui/IconButton';
import type { TocHeading } from '../markdown/pipeline';
import { readPreference, writePreference } from '../utils/storage';
import { InfoPanel } from './InfoPanel';
import { LinksPanel } from './LinksPanel';
import type { DocumentDto } from '@leandocs/shared';

type ContextTab = 'contents' | 'links' | 'info';
const TABS: { value: ContextTab; label: string }[] = [
  { value: 'contents', label: 'Contents' },
  { value: 'links', label: 'Links' },
  { value: 'info', label: 'Info' },
];

/**
 * Right context panel (UI_SPEC §43–48): "Contents", "Links" and "Info" tabs, one at a time.
 * Collapsed state and the chosen tab are remembered.
 */
export function ContextSidebar({
  headings,
  document: current,
  editing,
}: {
  headings: TocHeading[];
  document: DocumentDto;
  editing: boolean;
}) {
  const documentId = current.id;
  const [open, setOpen] = useState(() => readPreference('context.open', true));
  const [tab, setTab] = useState<ContextTab>(() => {
    const stored = readPreference<string>('context.tab', 'contents');
    return TABS.find((item) => item.value === stored)?.value ?? 'contents';
  });
  const toc = tocEntries(headings);
  const activeId = useScrollSpy(open && tab === 'contents' ? toc.map((heading) => heading.id) : []);

  const toggle = (next: boolean) => {
    setOpen(next);
    writePreference('context.open', next);
  };

  if (!open) {
    return (
      <div className="context context--collapsed">
        <IconButton label="Show side panel" onClick={() => toggle(true)}>
          <ChevronLeftIcon size={16} />
        </IconButton>
      </div>
    );
  }

  return (
    <aside className="context" aria-label="Document context">
      <div className="context__header">
        <div className="context__tabs" role="tablist" aria-label="Context">
          {TABS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              className="context__tab"
              onClick={() => {
                setTab(value);
                writePreference('context.tab', value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <IconButton label="Hide side panel" onClick={() => toggle(false)}>
          <ChevronRightIcon size={16} />
        </IconButton>
      </div>
      {tab === 'info' ? (
        <InfoPanel key={documentId} document={current} editing={editing} />
      ) : tab === 'links' ? (
        <LinksPanel documentId={documentId} />
      ) : toc.length === 0 ? (
        <p className="context__empty">No headings in this document.</p>
      ) : (
        <nav aria-label="Table of contents">
          <ul className="toc">
            {toc.map((heading) => (
              <li
                key={heading.id}
                style={{ paddingLeft: `calc(${heading.level} * var(--space-3))` }}
              >
                <a
                  href={`#${heading.id}`}
                  className={heading.id === activeId ? 'toc__link toc__link--active' : 'toc__link'}
                  aria-current={heading.id === activeId ? 'location' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById(heading.id)?.scrollIntoView({ block: 'start' });
                    window.history.replaceState(window.history.state, '', `#${heading.id}`);
                  }}
                >
                  {heading.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </aside>
  );
}

/**
 * Headings H1–H4 for the Contents panel with their nesting level. The level follows the outline,
 * not the raw depth: a heading is nested under the closest previous heading with a smaller depth,
 * so H1 → H3 indents once and a document starting at H2 starts at level 0. (The H1 that repeats
 * the document title is already removed by the renderer.)
 */
export function tocEntries(headings: TocHeading[]): (TocHeading & { level: number })[] {
  const stack: number[] = [];
  return headings
    .filter((heading) => heading.depth <= 4)
    .map((heading) => {
      while (stack.length > 0 && stack[stack.length - 1]! >= heading.depth) stack.pop();
      const level = stack.length;
      stack.push(heading.depth);
      return { ...heading, level };
    });
}

/** Highlights the heading closest above the top of the viewport while scrolling (UI_SPEC §45). */
function useScrollSpy(ids: string[]): string | undefined {
  const [active, setActive] = useState<string | undefined>(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    if (ids.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        }
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the id list
  }, [key]);
  return active;
}
