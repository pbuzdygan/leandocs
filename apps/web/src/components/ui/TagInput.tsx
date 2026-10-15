import { useId, useState, type KeyboardEvent } from 'react';
import { CloseIcon } from '../icons';

/**
 * Chips with an "Add…" input (UI_SPEC §116). Enter or comma adds, Backspace in the empty input
 * removes the last chip. `suggestions` feed the browser's own autocomplete list.
 */
export function TagInput({
  label,
  values,
  onChange,
  suggestions = [],
  disabled = false,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const value = raw.trim();
    setDraft('');
    if (!value || values.some((existing) => existing.toLowerCase() === value.toLowerCase())) return;
    onChange([...values, value]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(draft);
    } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  };
  // Read-only: a plain list, not a disabled control with a label pointing at nothing.
  if (disabled)
    return (
      <div className="field">
        <span className="field__label" id={`${id}-label`}>
          {label}
        </span>
        {values.length > 0 ? (
          <ul className="tag-input__readonly" aria-labelledby={`${id}-label`}>
            {values.map((value) => (
              <li key={value} className="tag">
                {value}
              </li>
            ))}
          </ul>
        ) : (
          <span className="tag-input__none">None</span>
        )}
      </div>
    );
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="tag-input">
        <ul className="tag-input__chips" aria-label={`Current ${label.toLowerCase()}`}>
          {values.map((value) => (
            <li key={value} className="tag tag-input__chip">
              {value}
              <button
                type="button"
                className="tag-input__remove"
                aria-label={`Remove ${value}`}
                onClick={() => onChange(values.filter((existing) => existing !== value))}
              >
                <CloseIcon size={12} />
              </button>
            </li>
          ))}
        </ul>
        <input
          id={id}
          className="tag-input__input"
          value={draft}
          placeholder="Add…"
          list={suggestions.length > 0 ? `${id}-suggestions` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
        />
        {suggestions.length > 0 && (
          <datalist id={`${id}-suggestions`}>
            {suggestions
              .filter((suggestion) => !values.includes(suggestion))
              .map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
          </datalist>
        )}
      </div>
    </div>
  );
}
