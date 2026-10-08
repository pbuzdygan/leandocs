import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../../api/client';
import { useContentMutation } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, TextField } from '../../components/ui/Field';
import { useNavigationState } from '../../navigation/NavigationContext';
import { stripExtension } from '../../utils/format';
import type { ItemTarget } from '../targets';

/**
 * Rename a document or folder. For documents the file name and the title are separate fields
 * (D-18): the title only changes when the user edits it.
 */
export function RenameDialog({ target, onClose }: { target: ItemTarget; onClose: () => void }) {
  const navigate = useNavigate();
  const { reveal } = useNavigationState();
  const initialName =
    target.kind === 'document' ? stripExtension(target.path.split('/').pop() ?? '') : target.name;
  const [name, setName] = useState(initialName);
  const [title, setTitle] = useState(target.kind === 'document' ? target.title : '');
  const mutation = useContentMutation(async () => {
    if (target.kind === 'document') {
      const titleChanged = title.trim() !== '' && title.trim() !== target.title;
      const document = await api.renameDocument(target.id, {
        name: name.trim(),
        ...(titleChanged ? { title: title.trim() } : {}),
      });
      if (document.id !== target.id) void navigate(`/doc/${encodeURIComponent(document.id)}`);
      return document.path;
    }
    return (await api.renameFolder({ path: target.path, name: name.trim() })).path;
  });

  const unchanged =
    name.trim() === initialName && (target.kind === 'folder' || title.trim() === target.title);
  const submit = () => {
    if (name.trim() === '' || unchanged || mutation.isPending) return;
    mutation.mutate(undefined, {
      onSuccess: (path) => {
        reveal(path);
        onClose();
      },
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={target.kind === 'document' ? 'Rename document' : 'Rename folder'}
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            variant="primary"
            disabled={name.trim() === '' || unchanged || mutation.isPending}
          >
            Rename
          </Button>
        </>
      }
    >
      <FormError message={mutation.error ? errorMessage(mutation.error) : null} />
      <TextField
        label={target.kind === 'document' ? 'File name' : 'Name'}
        value={name}
        onChange={(event) => setName(event.target.value)}
        autoFocus
        onFocus={(event) => event.target.select()}
      />
      {target.kind === 'document' && (
        <TextField
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          hint="Shown above the document and in the navigation."
        />
      )}
    </Dialog>
  );
}
