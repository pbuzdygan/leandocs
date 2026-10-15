import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { Tab, TabPanel, Tabs, TabsList } from './Tabs';
import { TagInput } from './TagInput';

describe('Button', () => {
  it('keeps its label, shows it is busy and ignores clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Sign in
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Sign in' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is not busy by default', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).not.toHaveAttribute('aria-busy');
  });
});

describe('Tabs', () => {
  function Example() {
    return (
      <Tabs defaultValue="view">
        <TabsList label="Document mode">
          <Tab value="view">View</Tab>
          <Tab value="source">Source</Tab>
        </TabsList>
        <TabPanel value="view">Rendered</TabPanel>
        <TabPanel value="source">Markdown</TabPanel>
      </Tabs>
    );
  }

  it('moves between tabs with the arrow keys and shows the linked panel', async () => {
    const user = userEvent.setup();
    render(<Example />);
    const view = screen.getByRole('tab', { name: 'View' });
    expect(view).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Rendered');

    await user.tab();
    expect(view).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    const source = screen.getByRole('tab', { name: 'Source' });
    expect(source).toHaveFocus();
    expect(source).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Source' })).toHaveTextContent('Markdown');
  });

  it('is a single Tab stop', async () => {
    const user = userEvent.setup();
    render(<Example />);
    await user.tab();
    await user.tab();
    expect(screen.getByRole('tab', { name: 'Source' })).not.toHaveFocus();
  });
});

describe('TagInput', () => {
  it('shows read-only values as a labelled list without an input', () => {
    render(<TagInput label="Tags" values={['server', 'docker']} onChange={() => {}} disabled />);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Tags' });
    expect(list).toHaveTextContent('server');
    expect(list).toHaveTextContent('docker');
  });

  it('says when a read-only list is empty', () => {
    render(<TagInput label="Aliases" values={[]} onChange={() => {}} disabled />);
    expect(screen.getByText('None')).toBeInTheDocument();
  });
});
