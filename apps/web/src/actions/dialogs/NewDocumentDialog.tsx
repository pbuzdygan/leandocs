import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage } from '../../api/client';
import { useContentMutation, useSettings, useTemplates, useTree } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, SelectField, TextField } from '../../components/ui/Field';
import { useNavigationState } from '../../navigation/NavigationContext';
import { collectFolders } from '../../navigation/tree-utils';
import { displayFolder } from '../../utils/format';

/**
 * UI_SPEC §64: name, location and template (PROJECT_SPEC §37). Without a `folder`, the location
 * starts at the default from Settings › General, or the top level if that folder is gone.
 */
export function NewDocumentDialog({ folder, onClose }: { folder?: string; onClose: () => void }) {
  const tree = useTree();
  const settings = useSettings();
  const navigate = useNavigate();
  const { reveal } = useNavigationState();
  const [name, setName] = useState('');
  const [location, setLocation] = useState(() => {
    if (folder !== undefined) return folder;
    const preferred = settings.data?.general.newDocumentFolder ?? '';
    return tree.data && collectFolders(tree.data).includes(preferred) ? preferred : '';
  });
  const [template, setTemplate] = useState('');
  const templates = useTemplates();
  const create = useContentMutation(api.createDocument);
  const folders = tree.data ? collectFolders(tree.data) : [location];

  const submit = () => {
    if (name.trim() === '' || create.isPending) return;
    create.mutate(
      { name: name.trim(), folder: location, ...(template ? { template } : {}) },
      {
        onSuccess: (document) => {
          reveal(document.path);
          void navigate(`/doc/${encodeURIComponent(document.id)}/edit`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title="New document"
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
        placeholder="Home Assistant"
        autoFocus
        hint="Also used as the file name."
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
      <SelectField
        label="Template"
        value={template}
        onChange={(event) => setTemplate(event.target.value)}
        hint="Templates are Markdown files in the _templates folder."
      >
        <option value="">Blank</option>
        {(templates.data?.items ?? []).map((item) => (
          <option key={item.name} value={item.name}>
            {item.name}
          </option>
        ))}
      </SelectField>
    </Dialog>
  );
}
