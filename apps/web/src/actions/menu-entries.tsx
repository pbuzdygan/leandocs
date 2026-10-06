import {
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ExternalLinkIcon,
  LinkIcon,
  MoveIcon,
  NewFileIcon,
  NewFolderIcon,
  PinIcon,
  TrashIcon,
  UnpinIcon,
} from '../components/icons';
import type { MenuEntry } from '../components/ui/Menu';
import { api } from '../api/client';
import type { ContentActions } from './ContentActions';
import type { ItemTarget } from './targets';

const icon = { size: 15 };

/**
 * Menu entries for a tree item or the document header (UI_SPEC §23, §129–130). Entries for
 * features that do not exist yet (Duplicate, History) are added in their phases.
 */
export function itemMenuEntries(
  target: ItemTarget,
  actions: ContentActions,
  open?: () => void,
): MenuEntry[] {
  if (target.kind === 'document') {
    return [
      ...(open ? [{ label: 'Open', icon: <ExternalLinkIcon {...icon} />, onSelect: open }] : []),
      ...(open
        ? [
            {
              label: 'Edit',
              icon: <EditIcon {...icon} />,
              onSelect: () => actions.editDocument(target.id),
            },
          ]
        : []),
      'separator',
      { label: 'Rename', icon: <EditIcon {...icon} />, onSelect: () => actions.rename(target) },
      { label: 'Move', icon: <MoveIcon {...icon} />, onSelect: () => actions.move(target) },
      actions.isPinned(target.id)
        ? {
            label: 'Unpin',
            icon: <UnpinIcon {...icon} />,
            onSelect: () => actions.togglePin(target.id),
          }
        : {
            label: 'Pin',
            icon: <PinIcon {...icon} />,
            onSelect: () => actions.togglePin(target.id),
          },
      'separator',
      {
        label: 'Copy link',
        icon: <LinkIcon {...icon} />,
        onSelect: () => actions.copyLink(target.id),
      },
      {
        label: 'Copy path',
        icon: <CopyIcon {...icon} />,
        onSelect: () => actions.copyPath(target.path),
      },
      {
        label: 'Download Markdown',
        icon: <DownloadIcon {...icon} />,
        onSelect: () => window.location.assign(api.rawDocumentUrl(target.id)),
      },
      'separator',
      {
        label: 'Move to trash',
        icon: <TrashIcon {...icon} />,
        danger: true,
        onSelect: () => actions.remove(target),
      },
    ];
  }
  return [
    {
      label: 'New document here',
      icon: <NewFileIcon {...icon} />,
      onSelect: () => actions.newDocument(target.path),
    },
    {
      label: 'New folder here',
      icon: <NewFolderIcon {...icon} />,
      onSelect: () => actions.newFolder(target.path),
    },
    'separator',
    { label: 'Rename', icon: <EditIcon {...icon} />, onSelect: () => actions.rename(target) },
    { label: 'Move', icon: <MoveIcon {...icon} />, onSelect: () => actions.move(target) },
    'separator',
    {
      label: 'Copy path',
      icon: <CopyIcon {...icon} />,
      onSelect: () => actions.copyPath(target.path),
    },
    'separator',
    {
      label: 'Move to trash',
      icon: <TrashIcon {...icon} />,
      danger: true,
      onSelect: () => actions.remove(target),
    },
  ];
}
