import { useState, type ReactNode } from 'react';
import {
  AUTOSAVE_DELAYS,
  TAB_SIZES,
  type AppSettings,
  type EditorMode,
  type UpdateSettingsRequest,
} from '@leandocs/shared';
import { errorMessage } from '../api/client';
import { useSettings, useTree, useUpdateSettings } from '../api/queries';
import { CheckboxField, FormError, SelectField } from '../components/ui/Field';
import { ErrorState, SkeletonLines } from '../components/ui/States';
import { collectFolders } from '../navigation/tree-utils';
import { displayFolder } from '../utils/format';

/** Loads the settings and saves every change at once (no Save button). */
function SettingsForm({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: (settings: AppSettings, save: (update: UpdateSettingsRequest) => void) => ReactNode;
}) {
  const settings = useSettings();
  const update = useUpdateSettings();
  // Query cache updates reach React a tick later; until then, show the change from local state so
  // controlled checkboxes do not flick back. Ignored as soon as the cached settings change.
  const [local, setLocal] = useState<{ base: AppSettings; value: AppSettings }>();
  const shown = local && local.base === settings.data ? local.value : settings.data;
  const save = (body: UpdateSettingsRequest) => {
    if (settings.data && shown)
      setLocal({
        base: settings.data,
        value: {
          general: { ...shown.general, ...body.general },
          editor: { ...shown.editor, ...body.editor },
        },
      });
    update.save(body);
  };
  if (settings.isError)
    return (
      <ErrorState
        title="Settings are unavailable"
        message={errorMessage(settings.error)}
        onRetry={() => void settings.refetch()}
      />
    );
  if (!shown) return <SkeletonLines count={4} />;
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="settings__title">
        {title}
      </h2>
      <FormError message={update.error ? `Not saved: ${errorMessage(update.error)}` : null} />
      <div className="settings__form">{children(shown, save)}</div>
      <p className="settings__note">Changes are saved automatically and apply on every device.</p>
    </section>
  );
}

/** UI_SPEC §82. */
export function GeneralSettings() {
  const tree = useTree();
  return (
    <SettingsForm id="general-title" title="General">
      {({ general }, save) => {
        const folders = tree.data ? collectFolders(tree.data) : [''];
        const missing = tree.data !== undefined && !folders.includes(general.newDocumentFolder);
        return (
          <>
            <CheckboxField
              label="Open last document on startup"
              hint="Opens the document you viewed last in this browser instead of the home page."
              checked={general.openLastDocument}
              onChange={(event) => save({ general: { openLastDocument: event.target.checked } })}
            />
            <SelectField
              label="Default location for new documents"
              hint={
                missing
                  ? 'This folder no longer exists. New documents go to the top level until you pick another folder.'
                  : 'Preselected for new documents, unless you create one from a folder or while a document is open (then its folder is used).'
              }
              value={general.newDocumentFolder}
              onChange={(event) => save({ general: { newDocumentFolder: event.target.value } })}
            >
              {missing && (
                <option value={general.newDocumentFolder}>
                  {displayFolder(general.newDocumentFolder)} (missing)
                </option>
              )}
              {folders.map((path) => (
                <option key={path} value={path}>
                  {displayFolder(path)}
                </option>
              ))}
            </SelectField>
            <CheckboxField
              label="Autosave"
              hint="When off, changes are saved with Save, Ctrl+S, Done, or when you leave the editor. Unsaved changes are still kept in this browser."
              checked={general.autosave}
              onChange={(event) => save({ general: { autosave: event.target.checked } })}
            />
          </>
        );
      }}
    </SettingsForm>
  );
}

const seconds = (ms: number) => `${(ms / 1000).toLocaleString('en')} s`;

/** UI_SPEC §83. */
export function EditorSettings() {
  return (
    <SettingsForm id="editor-title" title="Editor">
      {({ general, editor }, save) => (
        <>
          <SelectField
            label="Default editor"
            hint="The editor that opens when you start editing. You can still switch for each document."
            value={editor.defaultMode}
            onChange={(event) =>
              save({ editor: { defaultMode: event.target.value as EditorMode } })
            }
          >
            <option value="visual">Visual</option>
            <option value="source">Source</option>
          </SelectField>
          <SelectField
            label="Autosave delay"
            hint={
              general.autosave
                ? 'How long to wait after you stop typing before saving.'
                : 'Autosave is off (Settings › General).'
            }
            value={editor.autosaveDelay}
            disabled={!general.autosave}
            onChange={(event) => save({ editor: { autosaveDelay: Number(event.target.value) } })}
          >
            {AUTOSAVE_DELAYS.map((delay) => (
              <option key={delay} value={delay}>
                {seconds(delay)}
              </option>
            ))}
          </SelectField>
          <h3 className="settings__subtitle">Source editor</h3>
          <CheckboxField
            label="Show line numbers"
            checked={editor.lineNumbers}
            onChange={(event) => save({ editor: { lineNumbers: event.target.checked } })}
          />
          <CheckboxField
            label="Word wrap"
            hint="Wrap long lines instead of scrolling sideways."
            checked={editor.wordWrap}
            onChange={(event) => save({ editor: { wordWrap: event.target.checked } })}
          />
          <SelectField
            label="Tab size"
            hint="Spaces inserted by the Tab key."
            value={editor.tabSize}
            onChange={(event) => save({ editor: { tabSize: Number(event.target.value) } })}
          >
            {TAB_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} spaces
              </option>
            ))}
          </SelectField>
        </>
      )}
    </SettingsForm>
  );
}
