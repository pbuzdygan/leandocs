import type { AttachmentRef } from '../markdown/pipeline';

export interface MissingAttachment {
  name: string;
  links: number;
  images: number;
}

/**
 * Files the document links to (as links or images) that are not among its attachments, in order
 * of first appearance. Only the document's own attachments are checked; links to another
 * document's files are left out. Names are compared exactly, as the server looks them up.
 */
export function missingAttachments(
  refs: readonly AttachmentRef[],
  documentId: string,
  attached: readonly string[],
): MissingAttachment[] {
  const present = new Set(attached);
  const missing = new Map<string, MissingAttachment>();
  for (const ref of refs) {
    if (ref.documentId !== documentId || present.has(ref.name)) continue;
    const entry = missing.get(ref.name) ?? { name: ref.name, links: 0, images: 0 };
    if (ref.kind === 'image') entry.images += 1;
    else entry.links += 1;
    missing.set(ref.name, entry);
  }
  return [...missing.values()];
}

/** `2 links · image` */
export function describeUses({ links, images }: MissingAttachment): string {
  const part = (count: number, word: string) =>
    count === 0 ? [] : [count === 1 ? word : `${count} ${word}s`];
  return [...part(links, 'link'), ...part(images, 'image')].join(' · ');
}
