import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CheckboxField, SelectField, TextField } from './Field';

describe('form fields', () => {
  it('read the hint and the error when the field is focused (WCAG 1.3.1, 3.3.1)', () => {
    render(<TextField label="Name" hint="Shown in the tree." error="Name is required." />);
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Shown in the tree. Name is required.');
  });

  it('has no description without a hint or error', () => {
    render(<TextField label="Name" />);
    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
  });

  it('describes select fields the same way', () => {
    render(
      <SelectField label="Template" error="Template not found.">
        <option>Server</option>
      </SelectField>,
    );
    expect(screen.getByLabelText('Template')).toHaveAccessibleDescription('Template not found.');
  });

  it('labels checkboxes and reads their hint', () => {
    render(<CheckboxField label="Autosave" hint="Saves while you type." defaultChecked />);
    const checkbox = screen.getByRole('checkbox', { name: 'Autosave' });
    expect(checkbox).toBeChecked();
    expect(checkbox).toHaveAccessibleDescription('Saves while you type.');
  });
});
