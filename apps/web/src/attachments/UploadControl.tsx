import { useRef } from 'react';
import { Button } from '../components/ui/Button';

export type UploadFiles = (files: File[]) => Promise<string>;

export function UploadControl({
  onFiles,
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
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
