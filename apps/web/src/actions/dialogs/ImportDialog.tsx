import { useRef, useState, type ChangeEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { MAX_IMPORT_FILES, type ImportItem, type ImportReport } from '@leandocs/shared';
import { api, errorMessage, type ImportSelection } from '../../api/client';
import { useContentMutation, useTree } from '../../api/queries';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { FormError, SelectField } from '../../components/ui/Field';
import { useNotify } from '../../components/ui/Toast';
import { InfoIcon, WarningIcon } from '../../components/icons';
import { useNavigationState } from '../../navigation/NavigationContext';
import { collectFolders } from '../../navigation/tree-utils';
import { displayFolder } from '../../utils/format';
import './import.css';

type Source = 'directory' | 'files';

interface Selection {
  files: ImportSelection[];
  /** Files left out in the browser because they are inside hidden folders (`.git/`). */
  hidden: { count: number; folders: string[] };
}

const STATUS_LABEL: Record<ImportItem['status'], string> = {
  ready: 'Ready',
  imported: 'Imported',
  skipped: 'Skipped',
  failed: 'Failed',
};

/**
 * UI_SPEC §134–135 (ADR-0022): choose a Markdown directory or Markdown files and a destination,
 * review the preview with its warnings, then import. Nothing is written before Import.
 */
export function ImportDialog({ folder, onClose }: { folder: string; onClose: () => void }) {
  const tree = useTree();
  const notify = useNotify();
  const navigate = useNavigate();
  const { reveal } = useNavigationState();
  const [source, setSource] = useState<Source>('directory');
  const [destination, setDestination] = useState(folder);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const directoryInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const folders = tree.data ? collectFolders(tree.data) : [folder];

  const preview = useMutation({
    mutationFn: (files: ImportSelection[]) => api.importFiles(files, { destination, dryRun: true }),
  });
  const run = useContentMutation((files: ImportSelection[]) =>
    api.importFiles(files, { destination, dryRun: false }),
  );
  const report: ImportReport | undefined = run.data ?? preview.data;
  const done = run.data !== undefined;

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = selected(event.target.files, source);
    event.target.value = '';
    preview.reset();
    setSelectionError(null);
    if (!chosen) return;
    if (chosen.files.length === 0) {
      setSelectionError('The selection contains no files outside hidden folders.');
      return;
    }
    if (chosen.files.length > MAX_IMPORT_FILES) {
      setSelectionError(
        `Select at most ${MAX_IMPORT_FILES.toLocaleString('en')} files at once, or import in parts.`,
      );
      return;
    }
    setSelection(chosen);
    preview.mutate(chosen.files);
  };

  const back = () => {
    preview.reset();
    setSelection(null);
  };

  const submit = () => {
    if (!selection || !preview.data || preview.data.summary.documents === 0 || run.isPending)
      return;
    run.mutate(selection.files, {
      onSuccess: (result) => {
        const { documents, failed } = result.summary;
        if (failed > 0) notify.error(`Imported ${plural(documents, 'document')}; ${failed} failed`);
        else notify.info(`Imported ${plural(documents, 'document')}`);
      },
    });
  };

  const finish = () => {
    const imported = run.data?.items.filter((item) => item.status === 'imported') ?? [];
    if (imported.length === 1 && imported[0]!.documentId)
      void navigate(`/doc/${encodeURIComponent(imported[0]!.documentId)}`);
    else if (imported[0]?.destination) reveal(imported[0].destination);
    onClose();
  };

  const busy = preview.isPending || run.isPending;
  const actions = done ? (
    <Button variant="primary" onClick={finish}>
      Done
    </Button>
  ) : report ? (
    <>
      <Button onClick={back} disabled={busy}>
        Back
      </Button>
      <Button type="submit" variant="primary" disabled={report.summary.documents === 0 || busy}>
        {run.isPending ? 'Importing…' : `Import ${plural(report.summary.documents, 'document')}`}
      </Button>
    </>
  ) : (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button
        variant="primary"
        disabled={busy}
        onClick={() => (source === 'directory' ? directoryInput : filesInput).current?.click()}
      >
        {preview.isPending ? 'Preparing preview…' : 'Select files'}
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onOpenChange={(isOpen) => !isOpen && !run.isPending && (done ? finish() : onClose())}
      title={done ? 'Import finished' : report ? 'Import preview' : 'Import documentation'}
      onSubmit={report && !done ? submit : undefined}
      width={report ? 760 : 520}
      actions={actions}
    >
      <FormError
        message={
          selectionError ??
          (preview.error ? errorMessage(preview.error) : null) ??
          (run.error ? errorMessage(run.error) : null)
        }
      />
      {report ? (
        <ImportReportView report={report} hidden={selection?.hidden} />
      ) : (
        <>
          <fieldset className="import-source">
            <legend className="field__label">Import</legend>
            <label className="import-source__option">
              <input
                type="radio"
                name="import-source"
                checked={source === 'directory'}
                onChange={() => setSource('directory')}
                data-autofocus
              />
              <span>
                Markdown directory
                <span className="field__hint">A folder with its subfolders</span>
              </span>
            </label>
            <label className="import-source__option">
              <input
                type="radio"
                name="import-source"
                checked={source === 'files'}
                onChange={() => setSource('files')}
              />
              <span>
                Markdown files
                <span className="field__hint">One or more .md files</span>
              </span>
            </label>
          </fieldset>
          <SelectField
            label="Import into"
            value={destination}
            onChange={(event) => setDestination(event.target.value)}
            hint="Existing documents are never overwritten."
          >
            {folders.map((path) => (
              <option key={path} value={path}>
                {displayFolder(path)}
              </option>
            ))}
          </SelectField>
          <input
            ref={(element) => {
              directoryInput.current = element;
              element?.setAttribute('webkitdirectory', '');
            }}
            type="file"
            multiple
            hidden
            aria-label="Choose Markdown directory"
            onChange={choose}
          />
          <input
            ref={filesInput}
            type="file"
            multiple
            hidden
            accept=".md,text/markdown"
            aria-label="Choose Markdown files"
            onChange={choose}
          />
        </>
      )}
    </Dialog>
  );
}

function ImportReportView({
  report,
  hidden,
}: {
  report: ImportReport;
  hidden: Selection['hidden'] | undefined;
}) {
  const { documents, folders, skipped, failed, warnings } = report.summary;
  const into = displayFolder(report.destination);
  const details = [
    folders > 0 && `${plural(folders, 'new folder')}`,
    skipped > 0 && `${skipped} skipped`,
    failed > 0 && `${failed} failed`,
    warnings > 0 && plural(warnings, 'warning'),
  ].filter(Boolean);
  return (
    <div className="import-report">
      <p className="import-report__summary" role="status">
        {report.dryRun
          ? `${plural(documents, 'document')} will be imported into ${into}.`
          : `${plural(documents, 'document')} imported into ${into}.`}
        {details.length > 0 && ` ${details.join(' · ')}.`}
      </p>
      {hidden && hidden.count > 0 && (
        <p className="import-report__note">
          <InfoIcon size={14} /> Left out {plural(hidden.count, 'file')} in hidden folders (
          {hidden.folders.join(', ')}).
        </p>
      )}
      <div className="import-table" role="region" aria-label="Import items" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Destination</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.items.map((item) => (
              <tr key={item.source}>
                <td>
                  <span className="import-table__path">{item.source}</span>
                  {item.reason && <span className="import-table__reason">{item.reason}</span>}
                  {item.warnings.map((warning) => (
                    <span key={warning} className="import-table__warning">
                      <WarningIcon size={13} /> {warning}
                    </span>
                  ))}
                  {item.notes.map((note) => (
                    <span key={note} className="import-table__reason">
                      {note}
                    </span>
                  ))}
                </td>
                <td className="import-table__path">{item.destination ?? '—'}</td>
                <td>
                  <span className={`import-status import-status--${item.status}`}>
                    {STATUS_LABEL[item.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Paths come from `webkitRelativePath` (directory) or the file name (files). */
function selected(list: FileList | null, source: Source): Selection | null {
  if (!list || list.length === 0) return null;
  const files: ImportSelection[] = [];
  const hiddenFolders = new Set<string>();
  let hiddenCount = 0;
  for (const file of Array.from(list)) {
    const path = (source === 'directory' && file.webkitRelativePath) || file.name;
    const segments = path.split('/');
    const hiddenIndex = segments.slice(0, -1).findIndex((segment) => segment.startsWith('.'));
    if (hiddenIndex !== -1) {
      hiddenCount++;
      hiddenFolders.add(segments[hiddenIndex]!);
      continue;
    }
    files.push({ path, file });
  }
  return { files, hidden: { count: hiddenCount, folders: [...hiddenFolders].sort() } };
}

function plural(count: number, noun: string): string {
  return `${count.toLocaleString('en')} ${noun}${count === 1 ? '' : 's'}`;
}
