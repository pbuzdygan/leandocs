import { FileMissingIcon } from '../components/icons';
import { Link } from 'react-router';
import { EmptyState } from '../components/ui/States';
import { usePageTitle } from '../utils/page-title';

export function NotFound() {
  usePageTitle('Page not found');
  return (
    <EmptyState
      icon={<FileMissingIcon size={32} />}
      title="Page not found"
      level={1}
      actions={<Link to="/">Back to documentation</Link>}
    >
      The address does not match any page.
    </EmptyState>
  );
}
