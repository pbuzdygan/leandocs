import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { SkeletonLines } from '../components/ui/States';
import { AppShell } from './AppShell';
import { Home } from './Home';
import { NotFound } from './NotFound';
import { ThemeController } from './theme';
import { SetupGate, SetupPage } from '../auth/Setup';
import { AuthGate, LoginPage } from '../auth/Login';

// The document page carries the Markdown pipeline (parser, sanitiser, highlighter): load on demand.
const SettingsLayout = lazy(() =>
  import('../settings/SettingsLayout').then((module) => ({ default: module.SettingsLayout })),
);
const GeneralSettings = lazy(() =>
  import('../settings/PreferenceSettings').then((module) => ({ default: module.GeneralSettings })),
);
const EditorSettings = lazy(() =>
  import('../settings/PreferenceSettings').then((module) => ({ default: module.EditorSettings })),
);
const AppearanceSettings = lazy(() =>
  import('../settings/PreferenceSettings').then((module) => ({
    default: module.AppearanceSettings,
  })),
);
const StorageSettings = lazy(() =>
  import('../settings/StorageSettings').then((module) => ({ default: module.StorageSettings })),
);
const BrokenLinksSettings = lazy(() =>
  import('../settings/BrokenLinksSettings').then((module) => ({
    default: module.BrokenLinksSettings,
  })),
);
const IndexSettings = lazy(() =>
  import('../settings/IndexSettings').then((module) => ({ default: module.IndexSettings })),
);

const SecuritySettings = lazy(() =>
  import('../settings/SecuritySettings').then((module) => ({ default: module.SecuritySettings })),
);
const AboutSettings = lazy(() =>
  import('../settings/AboutSettings').then((module) => ({ default: module.AboutSettings })),
);

const TrashPage = lazy(() =>
  import('../trash/TrashPage').then((module) => ({ default: module.TrashPage })),
);
const DocumentPage = lazy(() =>
  import('../documents/DocumentPage').then((module) => ({ default: module.DocumentPage })),
);

function DocumentFallback() {
  return (
    <div className="doc" aria-busy="true">
      <SkeletonLines count={6} widths={['30%', '60%', '92%', '85%', '96%', '70%']} />
    </div>
  );
}

/** Routes (UI_SPEC §126). Document URLs use the stable id, never the path (§127). */
export function AppRoutes() {
  return (
    <>
      <ThemeController />
      <Routes>
        <Route path="setup" element={<SetupPage />} />
        <Route element={<SetupGate />}>
          <Route path="login" element={<LoginPage />} />
          <Route element={<AuthGate />}>
            <Route element={<AppShell />}>
              <Route index element={<Home />} />
              <Route
                path="doc/:id"
                element={
                  <Suspense fallback={<DocumentFallback />}>
                    <DocumentPage />
                  </Suspense>
                }
              />
              <Route
                path="doc/:id/edit"
                element={
                  <Suspense fallback={<DocumentFallback />}>
                    <DocumentPage editing />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<DocumentFallback />}>
                    <SettingsLayout />
                  </Suspense>
                }
              >
                <Route index element={<Navigate to="general" replace />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route path="editor" element={<EditorSettings />} />
                <Route path="appearance" element={<AppearanceSettings />} />
                <Route path="storage" element={<StorageSettings />} />
                <Route path="index" element={<IndexSettings />} />
                <Route path="links" element={<BrokenLinksSettings />} />
                <Route path="security" element={<SecuritySettings />} />
                <Route path="about" element={<AboutSettings />} />
              </Route>
              <Route
                path="trash"
                element={
                  <Suspense fallback={<DocumentFallback />}>
                    <TrashPage />
                  </Suspense>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </>
  );
}
