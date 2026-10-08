/** Something in the documentation tree that an action can apply to. */
export type ItemTarget =
  | { kind: 'document'; id: string; title: string; path: string }
  | { kind: 'folder'; path: string; name: string };

export function targetLabel(target: ItemTarget): string {
  return target.kind === 'document' ? target.title : target.name;
}
