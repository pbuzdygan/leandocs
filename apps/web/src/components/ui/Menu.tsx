import type { ReactElement, ReactNode } from 'react';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import './ui.css';

export type MenuEntry =
  | {
      label: string;
      icon?: ReactNode;
      onSelect: () => void;
      danger?: boolean;
      disabled?: boolean;
    }
  | 'separator';

/** Removes leading/trailing/duplicate separators so menus can be composed conditionally. */
function tidy(entries: MenuEntry[]): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (const entry of entries) {
    if (entry === 'separator' && (result.length === 0 || result.at(-1) === 'separator')) continue;
    result.push(entry);
  }
  if (result.at(-1) === 'separator') result.pop();
  return result;
}

/** `…` button menu (UI_SPEC §122). */
export function DropdownMenuButton({
  trigger,
  entries,
  align = 'end',
}: {
  trigger: ReactElement;
  entries: MenuEntry[];
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="menu" align={align} sideOffset={4}>
          {tidy(entries).map((entry, index) =>
            entry === 'separator' ? (
              <DropdownMenu.Separator key={`s${index}`} className="menu__separator" />
            ) : (
              <DropdownMenu.Item
                key={entry.label}
                className={entry.danger ? 'menu__item menu__item--danger' : 'menu__item'}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
              >
                {entry.icon}
                {entry.label}
              </DropdownMenu.Item>
            ),
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Right-click menu with the same entries as the `…` menu (UI_SPEC §23, §129). */
export function ContextMenuArea({
  children,
  entries,
}: {
  children: ReactNode;
  entries: MenuEntry[];
}) {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="menu">
          {tidy(entries).map((entry, index) =>
            entry === 'separator' ? (
              <ContextMenu.Separator key={`s${index}`} className="menu__separator" />
            ) : (
              <ContextMenu.Item
                key={entry.label}
                className={entry.danger ? 'menu__item menu__item--danger' : 'menu__item'}
                disabled={entry.disabled}
                onSelect={entry.onSelect}
              >
                {entry.icon}
                {entry.label}
              </ContextMenu.Item>
            ),
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
