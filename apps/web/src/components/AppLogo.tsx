import { APP_WORDMARK } from '@leandocs/shared';
import './brand.css';

/**
 * The LeanDocs mark, small-size variant (BRAND_SPEC §2: two slanted cards, folded corner, two
 * bars). Generated geometry from `branding/logo/mark-small.svg`; colours come from the brand
 * tokens in `styles/tokens.css`. Decorative: pair it with the name or an aria-label.
 */
export function AppLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="app-logo">
      <g transform="translate(7.79 9.35) scale(0.1745) skewY(-15)">
        <path
          className="app-logo__back"
          d="M36 0H164A36 36 0 0 1 200 36V264A36 36 0 0 1 164 300H36A36 36 0 0 1 0 264V36A36 36 0 0 1 36 0Z"
        />
        <path
          className="app-logo__front"
          d="M113.5 34H217.5L277.5 94V298A36 36 0 0 1 241.5 334H113.5A36 36 0 0 1 77.5 298V70A36 36 0 0 1 113.5 34Z"
        />
        <path className="app-logo__fold" d="M217.5 34V82a12 12 0 0 0 12 12H277.5Z" />
        <rect className="app-logo__bar" x="117.5" y="138" width="120" height="32" rx="16" />
        <rect className="app-logo__bar" x="117.5" y="204" width="84" height="32" rx="16" />
      </g>
    </svg>
  );
}

/** Wordmark "Lean**Docs**" (BRAND_SPEC §3). Reads as one word for assistive technology. */
export function Wordmark() {
  return (
    <span className="wordmark">
      {APP_WORDMARK.lead}
      <span className="wordmark__accent">{APP_WORDMARK.accent}</span>
    </span>
  );
}
