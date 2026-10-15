import { Link } from 'react-router';
import { usePins } from '../api/queries';
import { PinIcon } from '../components/icons';

/** Pinned documents above the tree (PROJECT_SPEC §40); hidden when nothing is pinned. */
export function PinnedSection({ activeId }: { activeId: string | undefined }) {
  const pins = usePins();
  const items = pins.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <nav className="pinned" aria-label="Pinned documents">
      <div className="pinned__title">Pinned</div>
      <ul className="pinned__list">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/doc/${encodeURIComponent(item.id)}`}
              className="nav-item"
              aria-current={item.id === activeId ? 'page' : undefined}
              title={item.path}
            >
              <PinIcon size={14} />
              <span className="pinned__label">{item.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
