import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import './ui.css';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
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
        aria-describedby={hint ? `${id}-hint` : undefined}
        {...input}
      />
      {hint && (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      )}
      {error && <div className="field__error">{error}</div>}
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
      <select id={id} className="input select" {...select}>
        {children}
      </select>
      {hint && <div className="field__hint">{hint}</div>}
      {error && <div className="field__error">{error}</div>}
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
