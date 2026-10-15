import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Tabs as RadixTabs } from 'radix-ui';
import './ui.css';

/**
 * Tabs (UI_SPEC §31, §44): WAI-ARIA tabs from Radix — one Tab stop, ← → (and Home/End) move
 * between tabs, and each tab is linked to its panel. Wrap the tabs and their panels in `Tabs`.
 */
export const Tabs = RadixTabs.Root;

export function TabsList({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <RadixTabs.List
      aria-label={label}
      className={['tabs__list', className].filter(Boolean).join(' ')}
    >
      {children}
    </RadixTabs.List>
  );
}

export function Tab({ className, ...props }: ComponentPropsWithoutRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger className={['tabs__tab', className].filter(Boolean).join(' ')} {...props} />
  );
}

export const TabPanel = RadixTabs.Content;
