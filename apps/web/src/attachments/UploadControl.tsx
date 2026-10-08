import { useRef, type RefObject } from 'react';
import { Button } from '../components/ui/Button';

export type UploadFiles = (files: File[]) => Promise<string>;

export function UploadControl({
  onFiles,
  disabled = false,
  inputRef,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Lets other controls open the same file picker (the slash menu's Attachment, UI_SPEC §38). */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  return (
    <>
      <Button
        size="small"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => input.current?.click()}
      >
        Attach files
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label="Choose attachments"
        accept=".png,.jpg,.jpeg,.webp,.svg,.pdf,.txt,.yaml,.yml,.json,.zip"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
