import { useRef, type RefObject } from 'react';
import { Toolbar } from 'radix-ui';
import { Button } from '../components/ui/Button';

export type UploadFiles = (files: File[]) => Promise<string>;

export function UploadControl({
  onFiles,
  disabled = false,
  inputRef,
  toolbar = false,
  hiddenTrigger = false,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Inside a Radix toolbar: the button joins its arrow-key navigation. */
  toolbar?: boolean;
  /** Only the file input; another control (a menu entry) opens it through `inputRef`. */
  hiddenTrigger?: boolean;
  /** Lets other controls open the same file picker (the slash menu's Attachment, UI_SPEC §38). */
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const ownInput = useRef<HTMLInputElement>(null);
  const input = inputRef ?? ownInput;
  const trigger = (
    <Button
      size="small"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => input.current?.click()}
    >
      Attach files
    </Button>
  );
  return (
    <>
      {!hiddenTrigger && (toolbar ? <Toolbar.Button asChild>{trigger}</Toolbar.Button> : trigger)}
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
