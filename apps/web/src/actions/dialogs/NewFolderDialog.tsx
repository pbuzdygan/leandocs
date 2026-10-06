import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useContentMutation, useTree } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, SelectField, TextField } from '../../components/ui/Field';
import { useNavigationState } from '../../navigation/NavigationContext';
import { collectFolders } from '../../navigation/tree-utils';
import { displayFolder } from '../../utils/format';

export function NewFolderDialog({ parent, onClose }: { parent: string; onClose: () => void }) {
  const tree = useTree();
  const { reveal } = useNavigationState();
  const [name, setName] = useState('');
  const [location, setLocation] = useState(parent);
  const create = useContentMutation(api.createFolder);
  const folders = tree.data ? collectFolders(tree.data) : [parent];

  const submit = () => {
    if (name.trim() === '' || create.isPending) return;
    create.mutate(
      { parent: location, name: name.trim() },
      {
        onSuccess: (folder) => {
          reveal(folder.path);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="New folder"
      onSubmit={submit}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={name.trim() === '' || create.isPending}>
            Create
          </Button>
        </>
      }
    >
      <FormError message={create.error ? errorMessage(create.error) : null} />
      <TextField
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Infrastructure"
        autoFocus
      />
      <SelectField
        label="Location"
        value={location}
        onChange={(event) => setLocation(event.target.value)}
      >
        {folders.map((path) => (
          <option key={path} value={path}>
            {displayFolder(path)}
          </option>
        ))}
      </SelectField>
    </Dialog>
  );
}
