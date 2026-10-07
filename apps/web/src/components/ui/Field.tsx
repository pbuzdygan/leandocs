import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import './ui.css';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

/** Hint and error ids for `aria-describedby`, so both are read when the field is focused. */
function describedBy(id: string, hint: ReactNode, error: string | null | undefined) {
  const ids = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ');
  return ids || undefined;
}

/** Labelled text input (UI_SPEC §120; WCAG: every field has a label). */
export function TextField({
  label,
  hint,
  error,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
      {hint && (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field__error" id={`${id}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  ...select
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input select"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...select}
      >
        {children}
      </select>
      {hint && (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field__error" id={`${id}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Native checkbox with its label on the right (UI_SPEC §121: minimal, accent when checked). */
export function CheckboxField({
  label,
  hint,
  error,
  ...input
}: FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const id = useId();
  return (
    <div className="field field--checkbox">
      <input
        id={id}
        type="checkbox"
        className="checkbox"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        {...input}
      />
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && (
        <div className="field__error" id={`${id}-error`}>
          {error}
        </div>
      )}
    </div>
  );
}

/** Inline error for dialogs/forms; announced to screen readers. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      {message}
    </div>
  );
}
