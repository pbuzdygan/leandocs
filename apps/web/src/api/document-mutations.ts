import type { DocumentDto } from '@leandocs/shared';

const listeners = new Set<(document: DocumentDto) => void>();

/** Distinguish successful in-app metadata changes from outside revision changes. */
export function subscribeDocumentMutations(listener: (document: DocumentDto) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function documentMutation(result: Promise<DocumentDto>): Promise<DocumentDto> {
  const document = await result;
  for (const listener of listeners) listener(document);
  return document;
}
