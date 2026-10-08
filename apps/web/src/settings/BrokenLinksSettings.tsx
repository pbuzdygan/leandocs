import { Link } from 'react-router';
import { errorMessage } from '../api/client';
import { useBrokenLinks } from '../api/queries';
import { ErrorState, SkeletonLines } from '../components/ui/States';

/** Broken links overview (PROJECT_SPEC §25, UI_SPEC §137): source document · broken target. */
export function BrokenLinksSettings() {
  const broken = useBrokenLinks();
  if (broken.isError)
    return (
      <ErrorState
        title="Broken links are unavailable"
        message={errorMessage(broken.error)}
        onRetry={() => void broken.refetch()}
      />
    );
  if (!broken.data) return <SkeletonLines count={4} />;
  const { items } = broken.data;
  return (
    <section aria-labelledby="broken-title">
      <h2 id="broken-title" className="settings__title">
        Broken links
      </h2>
      <p className="settings__note">
        Links that point to a document that does not exist. Create the missing document, or open the
        source document and fix the link.
      </p>
      {items.length === 0 ? (
        <p className="settings__note">
          No broken links. Every link points to an existing document.
        </p>
      ) : (
        <table className="settings__table">
          <thead>
            <tr>
              <th scope="col">Source document</th>
              <th scope="col">Broken target</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.source.id}-${index}`}>
                <td>
                  <Link to={`/doc/${encodeURIComponent(item.source.id)}`}>{item.source.title}</Link>
                  <div className="settings__issue-message">{item.source.path}</div>
                </td>
                <td>
                  <code>{item.kind === 'wiki' ? `[[${item.raw}]]` : item.raw}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
