import {
  createLinkResolver,
  linkKey,
  wikiKeys,
  type Backlink,
  type BrokenLink,
  type ExtractedLink,
  type LinkedDocument,
  type OutgoingLink,
} from '@leandocs/shared';
import type { DocumentEntry, DocumentRegistry } from '../documents/registry.js';
import { AppError } from '../errors.js';

function linked(entry: DocumentEntry): LinkedDocument {
  return { id: entry.id, title: entry.title, path: entry.path };
}

function raw(link: ExtractedLink): string {
  return link.kind === 'wiki' ? link.target : link.href;
}

/**
 * Outgoing links, backlinks and broken links (PROJECT_SPEC §22–25). Links are stored unresolved
 * in the index; they are resolved here against the current documents, so a link starts working
 * as soon as its target exists.
 */
export class LinkService {
  constructor(private readonly registry: DocumentRegistry) {}

  private entry(id: string): DocumentEntry {
    const entry = this.registry.get(id);
    if (!entry) throw new AppError(404, 'DOCUMENT_NOT_FOUND', 'Document not found');
    return entry;
  }

  outgoing(id: string): OutgoingLink[] {
    const source = this.entry(id);
    const resolver = createLinkResolver(this.registry.list());
    const items = new Map<string, OutgoingLink>();
    for (const { link } of this.registry.store.links({ sourceId: id })) {
      const target = resolver.resolve(link, source.path);
      const key = target ? `doc:${target.id}` : `raw:${link.kind}:${linkKey(raw(link))}`;
      const existing = items.get(key);
      if (existing) existing.count += 1;
      else
        items.set(key, {
          kind: link.kind,
          raw: raw(link),
          target: target ? linked(target) : null,
          count: 1,
        });
    }
    return [...items.values()];
  }

  backlinks(id: string): Backlink[] {
    const target = this.entry(id);
    const resolver = createLinkResolver(this.registry.list());
    const candidates = this.registry.store.links({
      lookups: [...new Set([...wikiKeys(target), linkKey(target.path)])],
    });
    const sources = new Map<string, Backlink>();
    for (const { sourceId, sourcePath, link } of candidates) {
      if (sourceId === id || resolver.resolve(link, sourcePath)?.id !== id) continue;
      const source = this.registry.get(sourceId);
      if (!source) continue;
      const existing = sources.get(sourceId);
      if (existing) existing.count += 1;
      else sources.set(sourceId, { ...linked(source), count: 1 });
    }
    return [...sources.values()].sort((a, b) => a.title.localeCompare(b.title));
  }

  broken(): BrokenLink[] {
    const resolver = createLinkResolver(this.registry.list());
    const items: BrokenLink[] = [];
    const seen = new Set<string>();
    for (const { sourceId, sourcePath, link } of this.registry.store.links()) {
      if (resolver.resolve(link, sourcePath)) continue;
      const source = this.registry.get(sourceId);
      const key = `${sourceId}\n${link.kind}\n${raw(link)}`;
      if (!source || seen.has(key)) continue;
      seen.add(key);
      items.push({ source: linked(source), kind: link.kind, raw: raw(link) });
    }
    return items;
  }
}
