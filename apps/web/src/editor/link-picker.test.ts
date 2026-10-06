import { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';
import { linkCandidates, wikiTargetFor } from './link-picker';
import { wikiCompletions } from './SourceEditor';

const documents = [
  { id: 'ha', title: 'Home Assistant', path: 'Applications/Home Assistant.md', aliases: ['HASS'] },
  { id: 'n1', title: 'Notes', path: 'A/Notes.md' },
  { id: 'n2', title: 'Notes', path: 'B/Notes.md' },
];

describe('link picker (P9-06)', () => {
  it('matches titles, paths and aliases', () => {
    expect(linkCandidates(documents, 'home').map((d) => d.id)).toEqual(['ha']);
    expect(linkCandidates(documents, 'hass').map((d) => d.id)).toEqual(['ha']);
    expect(linkCandidates(documents, '').length).toBe(3);
  });

  it('writes the title, or the path when the title is shared', () => {
    expect(wikiTargetFor(documents[0]!, documents)).toBe('Home Assistant');
    expect(wikiTargetFor(documents[1]!, documents)).toBe('Notes'); // first in path order wins
    expect(wikiTargetFor(documents[2]!, documents)).toBe('B/Notes');
  });

  it('completes after [[ in the source editor and reuses the auto-closed ]]', () => {
    const state = EditorState.create({ doc: 'See [[hom]] now' });
    const pos = 'See [[hom'.length;
    const result = wikiCompletions(() => documents)(new CompletionContext(state, pos, false));
    expect(result?.from).toBe(6);
    expect(result?.options.map((option) => option.label)).toEqual(['Home Assistant']);
    const view = new EditorView({ state });
    const apply = result!.options[0]!.apply as (
      view: EditorView,
      completion: unknown,
      from: number,
      to: number,
    ) => void;
    apply(view, result!.options[0], result!.from, pos);
    expect(view.state.doc.toString()).toBe('See [[Home Assistant]] now');
    view.destroy();
    expect(
      wikiCompletions(() => documents)(
        new CompletionContext(EditorState.create({ doc: 'no link' }), 7, false),
      ),
    ).toBeNull();
  });
});
