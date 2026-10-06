import { FileMissingIcon } from '../components/icons';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/States';

export function NotFound() {
  return (
    <EmptyState
      icon={<FileMissingIcon size={32} />}
      title="Page not found"
      actions={<Link to="/">Back to documentation</Link>}
    >
      The address does not match any page.
    </EmptyState>
  );
}
