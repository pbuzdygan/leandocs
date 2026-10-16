import type { ReactNode } from 'react';
import './ui.css';

/**
 * Compact header of an application page (guidelines §36): title, optional short description and
 * the page's actions. Application pages use 24 px titles; documents keep 32 px (UI_SPEC §28,
 * owner decision B, 2026-10-15).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header__row">
        <h1 className="page-header__title">{title}</h1>
        {actions && <div className="page-header__actions">{actions}</div>}
      </div>
      {description && <p className="page-header__description">{description}</p>}
    </div>
  );
}
