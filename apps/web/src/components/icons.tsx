import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconFolderSymlink,
  IconFileImport,
  IconBold,
  IconBraces,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconCode,
  IconCopy,
  IconDots,
  IconDownload,
  IconExternalLink,
  IconFilePlus,
  IconFileText,
  IconFileUnknown,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconInfoCircle,
  IconItalic,
  IconLayoutSidebarRight,
  IconLink,
  IconList,
  IconListCheck,
  IconListNumbers,
  IconLoader2,
  IconMenu2,
  IconPaperclip,
  IconPencil,
  IconPhoto,
  IconPilcrow,
  IconPin,
  IconPinnedOff,
  IconPlus,
  IconPointFilled,
  IconQuote,
  IconRefresh,
  IconRestore,
  IconSearch,
  IconSeparatorHorizontal,
  IconSettings,
  IconStrikethrough,
  IconTable,
  IconTrash,
  IconViewportNarrow,
  IconViewportWide,
  IconX,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { SVGProps } from 'react';

/**
 * The only place that knows the icon library (UI_SPEC §13, D-43): **Tabler Icons**
 * (`@tabler/icons-react`, MIT), outline style, bundled from npm (no CDN). App code imports these
 * named components, so swapping an icon changes this file only. Add new icons here first.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'stroke'> {
  size?: number;
  /** Tabler's default stroke width is 2. */
  stroke?: number;
}

function icon(Tabler: TablerIcon, name: string) {
  function Icon({ size = 16, ...props }: IconProps) {
    // Decorative unless labelled, so screen readers skip it next to visible text.
    const decorative = props['aria-label'] === undefined && props['aria-labelledby'] === undefined;
    return (
      <Tabler
        size={size}
        aria-hidden={decorative ? true : undefined}
        focusable="false"
        {...props}
      />
    );
  }
  Icon.displayName = name;
  return Icon;
}

export type IconComponent = ReturnType<typeof icon>;

// Navigation and layout
export const MenuIcon = icon(IconMenu2, 'MenuIcon');
export const SearchIcon = icon(IconSearch, 'SearchIcon');
export const SettingsIcon = icon(IconSettings, 'SettingsIcon');
export const ChevronDownIcon = icon(IconChevronDown, 'ChevronDownIcon');
export const ChevronLeftIcon = icon(IconChevronLeft, 'ChevronLeftIcon');
export const ChevronRightIcon = icon(IconChevronRight, 'ChevronRightIcon');
export const ExpandWidthIcon = icon(IconViewportWide, 'ExpandWidthIcon');
export const ShrinkWidthIcon = icon(IconViewportNarrow, 'ShrinkWidthIcon');
export const MoreIcon = icon(IconDots, 'MoreIcon');
export const CloseIcon = icon(IconX, 'CloseIcon');
export const BackIcon = icon(IconArrowLeft, 'BackIcon');
export const ForwardIcon = icon(IconArrowRight, 'ForwardIcon');
export const ContextPanelIcon = icon(IconLayoutSidebarRight, 'ContextPanelIcon');
export const ExternalLinkIcon = icon(IconExternalLink, 'ExternalLinkIcon');

// Documents, folders and actions
export const FileIcon = icon(IconFileText, 'FileIcon');
export const NewFileIcon = icon(IconFilePlus, 'NewFileIcon');
export const FileMissingIcon = icon(IconFileUnknown, 'FileMissingIcon');
export const FolderIcon = icon(IconFolder, 'FolderIcon');
export const FolderOpenIcon = icon(IconFolderOpen, 'FolderOpenIcon');
export const NewFolderIcon = icon(IconFolderPlus, 'NewFolderIcon');
export const MoveIcon = icon(IconFolderSymlink, 'MoveIcon');
export const AddIcon = icon(IconPlus, 'AddIcon');
export const EditIcon = icon(IconPencil, 'EditIcon');
export const TrashIcon = icon(IconTrash, 'TrashIcon');
export const RestoreIcon = icon(IconRestore, 'RestoreIcon');
export const CopyIcon = icon(IconCopy, 'CopyIcon');
export const DownloadIcon = icon(IconDownload, 'DownloadIcon');
export const ImportIcon = icon(IconFileImport, 'ImportIcon');
export const LinkIcon = icon(IconLink, 'LinkIcon');
export const AttachmentIcon = icon(IconPaperclip, 'AttachmentIcon');
export const RefreshIcon = icon(IconRefresh, 'RefreshIcon');
export const PinIcon = icon(IconPin, 'PinIcon');
export const UnpinIcon = icon(IconPinnedOff, 'UnpinIcon');

// Status
export const CheckIcon = icon(IconCheck, 'CheckIcon');
export const AlertIcon = icon(IconAlertCircle, 'AlertIcon');
export const WarningIcon = icon(IconAlertTriangle, 'WarningIcon');
export const InfoIcon = icon(IconInfoCircle, 'InfoIcon');
export const DotIcon = icon(IconPointFilled, 'DotIcon');
export const LoadingIcon = icon(IconLoader2, 'LoadingIcon');

// Editor formatting
export const ParagraphIcon = icon(IconPilcrow, 'ParagraphIcon');
export const BoldIcon = icon(IconBold, 'BoldIcon');
export const ItalicIcon = icon(IconItalic, 'ItalicIcon');
export const StrikethroughIcon = icon(IconStrikethrough, 'StrikethroughIcon');
export const InlineCodeIcon = icon(IconCode, 'InlineCodeIcon');
export const BulletListIcon = icon(IconList, 'BulletListIcon');
export const NumberedListIcon = icon(IconListNumbers, 'NumberedListIcon');
export const ChecklistIcon = icon(IconListCheck, 'ChecklistIcon');
export const QuoteIcon = icon(IconQuote, 'QuoteIcon');
export const ImageIcon = icon(IconPhoto, 'ImageIcon');
export const TableIcon = icon(IconTable, 'TableIcon');
export const CodeBlockIcon = icon(IconBraces, 'CodeBlockIcon');
export const DividerIcon = icon(IconSeparatorHorizontal, 'DividerIcon');
