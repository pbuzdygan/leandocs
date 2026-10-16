import { Fragment, type ReactNode } from 'react';
import { modifierLabel } from '../search/SearchContext';

/** One way to press a shortcut: keys pressed together. */
type Combo = string[];

interface Shortcut {
  /** Alternatives, shown as "A or B". */
  keys: Combo[];
  action: ReactNode;
}

interface ShortcutGroup {
  id: string;
  title: string;
  note?: string;
  /** Typed one after another (Markdown), not pressed together. */
  typed?: boolean;
  items: Shortcut[];
}

/**
 * The key names for this device: Ctrl/Alt elsewhere, ⌘/Option on Apple platforms. Redo differs
 * by platform in the editors (Ctrl+Y, ⌘+Shift+Z).
 */
function deviceKeys() {
  const mod = modifierLabel();
  const apple = mod === '⌘';
  return { mod, alt: apple ? 'Option' : 'Alt', redo: apple ? [mod, 'Shift', 'Z'] : [mod, 'Y'] };
}

/**
 * Every shortcut LeanDocs handles itself, grouped by where it works. Keep in sync with the key
 * handlers: SearchProvider, useToggleShortcut, NavigationTree, CommandPalette, SourceEditor and the
 * visual editor (create-editor.ts plus Milkdown's commonmark/gfm keymaps and input rules).
 */
function shortcutGroups(): ShortcutGroup[] {
  const { mod, alt, redo } = deviceKeys();
  return [
    {
      id: 'everywhere',
      title: 'Everywhere',
      items: [
        { keys: [[mod, 'K']], action: 'Search the contents of all documents' },
        { keys: [[mod, 'P']], action: 'Open a document by title, alias or path' },
        {
          keys: [[mod, 'E']],
          action: 'On a document: start editing, or save and return to reading',
        },
        { keys: [['Esc']], action: 'Close a dialog, menu, the search or the navigation drawer' },
        {
          keys: [['Tab'], ['Shift', 'Tab']],
          action: 'Move to the next or previous control',
        },
        {
          keys: [['←'], ['→']],
          action:
            'In tabs and toolbars: move between items (the group itself is one Tab stop). On a panel edge: make the panel narrower or wider',
        },
      ],
    },
    {
      id: 'navigation',
      title: 'Navigation tree',
      note: 'When a document or folder in the navigation has focus.',
      items: [
        { keys: [['↑'], ['↓']], action: 'Previous or next item' },
        { keys: [['Home'], ['End']], action: 'First or last item' },
        { keys: [['→']], action: 'Expand a folder, step into it, or open a document' },
        { keys: [['←']], action: 'Collapse a folder or go to its parent folder' },
        { keys: [['Enter']], action: 'Open the document or folder' },
        { keys: [['F2']], action: 'Rename' },
        { keys: [['Delete']], action: 'Move to the trash' },
      ],
    },
    {
      id: 'search',
      title: 'Search',
      items: [
        { keys: [['↑'], ['↓']], action: 'Choose a result' },
        { keys: [['Enter']], action: 'Open the result' },
        {
          keys: [
            [mod, 'K'],
            [mod, 'P'],
          ],
          action: 'Switch between search and open by title',
        },
        { keys: [['Esc']], action: 'Close' },
      ],
    },
    {
      id: 'editing',
      title: 'Editing (both editors)',
      items: [
        { keys: [[mod, 'S']], action: 'Save now' },
        { keys: [['Esc']], action: 'Save and return to reading' },
        { keys: [[mod, 'B']], action: 'Bold' },
        { keys: [[mod, 'I']], action: 'Italic' },
        { keys: [[mod, 'Z']], action: 'Undo' },
        { keys: [redo], action: 'Redo' },
        { keys: [[mod, 'V']], action: 'Paste; a pasted image is uploaded as an attachment' },
        { keys: [['[[']], action: 'Link to a document: ↑ ↓ choose, Enter inserts, Esc closes' },
      ],
    },
    {
      id: 'visual',
      title: 'Visual editor',
      items: [
        { keys: [[mod, alt, '1…6']], action: 'Heading 1 to 6' },
        { keys: [[mod, alt, '0']], action: 'Normal text' },
        { keys: [[mod, alt, '8']], action: 'Bullet list' },
        { keys: [[mod, alt, '7']], action: 'Numbered list' },
        { keys: [[mod, 'Shift', 'B']], action: 'Quote' },
        { keys: [[mod, alt, 'C']], action: 'Code block' },
        { keys: [[mod, alt, 'X']], action: 'Strikethrough' },
        { keys: [['Shift', 'Enter']], action: 'Line break within a paragraph' },
        {
          keys: [['Tab'], ['Shift', 'Tab']],
          action: 'In a list: indent or outdent the item. In a table: next or previous cell',
        },
        {
          keys: [['Enter']],
          action: 'Twice at the end of a code block: leave it (↓ on its last line does the same)',
        },
        { keys: [['/']], action: 'Insert a block: ↑ ↓ choose, Enter inserts, Esc closes' },
      ],
    },
    {
      id: 'markdown',
      title: 'Typing Markdown in the visual editor',
      note: 'Type these and the visual editor formats them as you go.',
      typed: true,
      items: [
        { keys: [['#', 'Space']], action: 'Heading (## for level 2, up to ######)' },
        {
          keys: [
            ['-', 'Space'],
            ['*', 'Space'],
          ],
          action: 'Bullet list',
        },
        { keys: [['1.', 'Space']], action: 'Numbered list' },
        { keys: [['[ ]', 'Space']], action: 'Checklist item (inside a list)' },
        { keys: [['>', 'Space']], action: 'Quote' },
        { keys: [['```', 'Enter']], action: 'Code block (a language may follow ```)' },
        { keys: [['---']], action: 'Divider' },
        { keys: [['**text**']], action: 'Bold' },
        { keys: [['*text*']], action: 'Italic' },
        { keys: [['`text`']], action: 'Inline code' },
        { keys: [['~~text~~']], action: 'Strikethrough' },
        { keys: [['|3x2|', 'Space']], action: 'Table with 3 columns and 2 rows' },
        { keys: [['[[Document]]']], action: 'Link to a document' },
      ],
    },
    {
      id: 'source',
      title: 'Source editor',
      items: [
        { keys: [[mod, 'F']], action: 'Find and replace (Esc closes the search first)' },
        { keys: [[mod, 'G'], ['F3']], action: 'Next match' },
        {
          keys: [
            [mod, 'Shift', 'G'],
            ['Shift', 'F3'],
          ],
          action: 'Previous match',
        },
        { keys: [[mod, alt, 'G']], action: 'Go to line' },
        {
          keys: [
            [alt, '↑'],
            [alt, '↓'],
          ],
          action: 'Move the line up or down',
        },
        {
          keys: [
            ['Shift', alt, '↑'],
            ['Shift', alt, '↓'],
          ],
          action: 'Copy the line up or down',
        },
        { keys: [[mod, 'Shift', 'K']], action: 'Delete the line' },
        { keys: [[mod, '/']], action: 'Comment or uncomment (<!-- … -->)' },
        { keys: [['Tab'], ['Shift', 'Tab']], action: 'Indent or outdent' },
      ],
    },
    {
      id: 'fields',
      title: 'Tags and aliases',
      items: [
        { keys: [['Enter'], [',']], action: 'Add the typed value' },
        { keys: [['Backspace']], action: 'In an empty field: remove the last value' },
      ],
    },
  ];
}

function Keys({ keys, typed = false }: { keys: Combo[]; typed?: boolean }) {
  return (
    <>
      {keys.map((combo, index) => (
        <Fragment key={combo.join('+')}>
          {index > 0 && <span className="shortcuts__or"> or </span>}
          <span className="shortcuts__combo">
            {combo.map((key, keyIndex) => (
              <Fragment key={keyIndex}>
                {keyIndex > 0 && (typed ? ' then ' : <span aria-hidden="true">+</span>)}
                <kbd className={typed ? 'shortcuts__key shortcuts__key--typed' : 'shortcuts__key'}>
                  {key}
                </kbd>
              </Fragment>
            ))}
          </span>
        </Fragment>
      ))}
    </>
  );
}

/** Settings › Help › Shortcuts: every keyboard shortcut, with the key names of this device. */
export function ShortcutsSettings() {
  const groups = shortcutGroups();
  return (
    <section aria-labelledby="shortcuts-title" className="shortcuts">
      <h2 id="shortcuts-title" className="settings__title">
        Shortcuts
      </h2>
      <p className="settings__note">
        Keys are shown for this device ({deviceKeys().mod} is the main modifier). Shortcuts in an
        editor work while the cursor is in it.
      </p>
      {groups.map((group) => (
        <Fragment key={group.id}>
          <h3 id={`shortcuts-${group.id}`} className="settings__subtitle">
            {group.title}
          </h3>
          {group.note && <p className="settings__note">{group.note}</p>}
          <table
            className="settings__table shortcuts__table"
            aria-labelledby={`shortcuts-${group.id}`}
          >
            <thead>
              <tr>
                <th scope="col">Keys</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((item) => (
                <tr key={item.keys.map((combo) => combo.join('+')).join('|')}>
                  <td>
                    <Keys keys={item.keys} typed={group.typed} />
                  </td>
                  <td>{item.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Fragment>
      ))}
    </section>
  );
}
