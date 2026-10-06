import { useEffect, useId, useState } from 'react';
import { WarningIcon } from '../components/icons';
import type { Mermaid } from 'mermaid';

type MermaidApi = Mermaid;
let loader: Promise<MermaidApi> | undefined;

/** Mermaid is large, so it is loaded only when the first diagram appears. */
function loadMermaid(): Promise<MermaidApi> {
  loader ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      // PROJECT_SPEC §20/§52: strict = no scripts, no click handlers, sanitised labels.
      securityLevel: 'strict',
      theme: 'neutral',
      fontFamily: 'Inter Variable, Inter, ui-sans-serif, system-ui, sans-serif',
    });
    return mermaid;
  });
  return loader;
}

type State =
  { status: 'loading' } | { status: 'ok'; svg: string } | { status: 'error'; message: string };

/** UI_SPEC §56: neutral container; a broken diagram never breaks the document. */
export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${reactId.replace(/[^a-zA-Z0-9]/g, '')}`;
    loadMermaid()
      .then((mermaid) => mermaid.render(id, source))
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
  }, [source, reactId]);

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
