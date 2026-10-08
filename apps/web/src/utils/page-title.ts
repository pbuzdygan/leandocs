import { useEffect } from 'react';
import { APP_NAME } from '@leandocs/shared';

/** Sets the browser tab title so every screen is identifiable (WCAG 2.4.2): `Page — LeanDocs`. */
export function usePageTitle(page?: string) {
  useEffect(() => {
    document.title = page ? `${page} — ${APP_NAME}` : APP_NAME;
  }, [page]);
}
