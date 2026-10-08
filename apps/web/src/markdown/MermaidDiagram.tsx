import { useEffect, useId, useState } from 'react';
import { WarningIcon } from '../components/icons';
import type { Mermaid } from 'mermaid';
import { useResolvedTheme, type ResolvedTheme } from '../app/theme';

type MermaidApi = Mermaid;
let loader: Promise<MermaidApi> | undefined;

/** Mermaid is large, so it is loaded only when the first diagram appears. */
function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then(({ default: mermaid }) => mermaid);
  return loader;
}

/**
 * Dark diagrams use the app's dark tokens: Mermaid's own dark theme is warm grey with heavy
 * borders, not the neutral slate of the UI (UI_SPEC §85). Mermaid needs literal colours.
 */
function darkVariables(): Record<string, string | boolean> {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  return {
    darkMode: true,
    background: token('--bg-surface'),
    primaryColor: token('--bg-subtle'),
    primaryTextColor: token('--text-primary'),
    primaryBorderColor: token('--border-strong'),
    secondaryColor: token('--bg-selected'),
    tertiaryColor: token('--bg-surface'),
    lineColor: token('--text-muted'),
    textColor: token('--text-primary'),
    noteBkgColor: token('--bg-subtle'),
    noteTextColor: token('--text-primary'),
    noteBorderColor: token('--border-strong'),
  };
}

/**
 * Mermaid's configuration is global, so it is set right before each render: diagrams match the
 * theme shown (UI_SPEC §84) and are drawn again when it changes.
 */
function configure(mermaid: MermaidApi, theme: ResolvedTheme): void {
  mermaid.initialize({
    startOnLoad: false,
    // PROJECT_SPEC §20/§52: strict = no scripts, no click handlers, sanitised labels.
    securityLevel: 'strict',
    ...(theme === 'dark'
      ? { theme: 'base', themeVariables: darkVariables() }
      : { theme: 'neutral' }),
    fontFamily: 'Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif',
  });
}

type State =
  { status: 'loading' } | { status: 'ok'; svg: string } | { status: 'error'; message: string };

/** UI_SPEC §56: neutral container; a broken diagram never breaks the document. */
export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const theme = useResolvedTheme();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
    loadMermaid()
      .then((mermaid) => {
        configure(mermaid, theme);
        return mermaid.render(id, source);
      })
      .then(({ svg }) => !cancelled && setState({ status: 'ok', svg }))
      .catch((error: unknown) => {
        // Mermaid can leave its temporary render container behind on errors.
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, reactId, theme]);

  return (
    <figure className="mermaid">
      {state.status === 'loading' && <div className="mermaid__loading">Rendering diagram…</div>}
      {state.status === 'ok' && (
        // SVG produced by Mermaid in strict mode (sanitised by Mermaid's own DOMPurify).
        <div className="mermaid__svg" dangerouslySetInnerHTML={{ __html: state.svg }} />
      )}
      {state.status === 'error' && (
        <div className="mermaid__error" role="note">
          <WarningIcon size={14} aria-hidden="true" /> Diagram rendering error
        </div>
      )}
      <div className="mermaid__actions">
        <button
          type="button"
          className="link-button"
          onClick={() => setShowSource(!showSource)}
          aria-expanded={showSource}
        >
          {showSource ? 'Hide source' : 'Open source'}
        </button>
      </div>
      {(showSource || state.status === 'error') && (
        <pre className="mermaid__source">
          {state.status === 'error' && `${state.message}\n\n`}
          {source}
        </pre>
      )}
    </figure>
  );
}
