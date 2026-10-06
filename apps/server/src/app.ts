import { AuthInitialization } from './auth/initialized.js';
import { loadMfaKey, MfaStore } from './auth/mfa.js';
import { registerSecurityHeaders } from './security/headers.js';
import { attachmentRoutes } from './api/attachments.js';
import { AttachmentService } from './attachments/service.js';
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import { API_BASE_PATH, type ApiErrorBody, type SessionResponse } from '@leandocs/shared';
import Fastify, {
  LogController,
  type FastifyError,
  type FastifyInstance,
  type RouteOptions,
} from 'fastify';
import { AuthService } from './auth/session.js';
import { checkCsrfOrigin, checkCsrfToken, unsafeMethod } from './auth/csrf.js';
import { ProxyAuthService } from './auth/proxy.js';
import { authRoutes } from './api/auth.js';
import { documentRoutes } from './api/documents.js';
import { folderRoutes } from './api/folders.js';
import { trashRoutes } from './api/trash.js';
import { setupRoutes } from './api/setup.js';
import { SetupService } from './auth/setup.js';
import { healthRoutes } from './api/health.js';
import { indexingRoutes } from './api/indexing.js';
import { linkRoutes } from './api/links.js';
import { templateRoutes } from './api/templates.js';
import { pinRoutes } from './api/pins.js';
import { PinService } from './pins/service.js';
import { TemplateService } from './templates/service.js';
import { LinkService } from './links/service.js';
import { searchRoutes } from './api/search.js';
import { ConfigError, type AppConfig } from './config/config.js';
import { openDatabase } from './db/database.js';
import { DocumentRegistry } from './documents/registry.js';
import { LinkUpdater } from './documents/link-updater.js';
import { DocumentService } from './documents/service.js';
import { AppError } from './errors.js';
import { ensureDataDirs } from './filesystem/data-dir.js';
import { MutationLock } from './filesystem/lock.js';
import { SearchService } from './search/service.js';
import { FolderService } from './folders/service.js';
import { TrashService } from './trash/trash.js';
import { ContentSync } from './watcher/content-sync.js';
import { ContentWatcher } from './watcher/content-watcher.js';

// Documents can be large; the default 1 MiB body limit is too small for real runbooks.
const BODY_LIMIT_BYTES = 10 * 1024 * 1024;

export async function buildApp(
  config: AppConfig,
  observeRoute?: (route: RouteOptions) => void,
): Promise<FastifyInstance> {
  if (config.authMode === 'proxy' && !config.proxyAuth)
    throw new ConfigError('Proxy authentication requires explicit trusted-proxy configuration');
  const app = Fastify({
    logger: { level: config.logLevel },
    bodyLimit: BODY_LIMIT_BYTES,
    // Reject unknown request fields instead of silently dropping them.
    ajv: { customOptions: { removeAdditional: false } },
    // PROJECT_SPEC §81: log field is `requestId`; per-request lines only at debug/trace.
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      disableRequestLogging: config.logLevel !== 'debug' && config.logLevel !== 'trace',
    }),
  });

  registerSecurityHeaders(app, config);

  const { contentDir, systemDir } = await ensureDataDirs(config.dataDir);
  // SQLite index (ADR-0003); the registry reconciles it with the filesystem on refresh (§62).
  const db = openDatabase(systemDir, app.log.child({ module: 'db' }));
  let mfa: MfaStore | undefined;
  let initialization: AuthInitialization;
  try {
    initialization = new AuthInitialization(db, systemDir);
    if (config.authMode === 'local') mfa = new MfaStore(db, await loadMfaKey(systemDir, db));
  } catch (error) {
    db.close();
    throw error;
  }
  const auth = new AuthService(db, undefined, undefined, mfa);
  const proxyAuth =
    config.authMode === 'proxy' ? new ProxyAuthService(config.proxyAuth!) : undefined;
  const noneSession: SessionResponse | undefined =
    config.authMode === 'none'
      ? { authMode: 'none', user: null, csrfToken: auth.session(undefined).csrfToken }
      : undefined;
  if (config.authMode === 'none')
    app.log.warn(
      'Authentication is disabled. Anyone who can reach this application can read, edit and delete documentation.',
    );
  if (observeRoute) app.addHook('onRoute', observeRoute);
  const publicRoutes = new Set([
    `GET ${API_BASE_PATH}/health`,
    `HEAD ${API_BASE_PATH}/health`,
    `GET ${API_BASE_PATH}/auth/setup`,
    `HEAD ${API_BASE_PATH}/auth/setup`,
    `POST ${API_BASE_PATH}/auth/setup`,
    `GET ${API_BASE_PATH}/auth/session`,
    `HEAD ${API_BASE_PATH}/auth/session`,
    `POST ${API_BASE_PATH}/auth/login`,
    `POST ${API_BASE_PATH}/auth/mfa/verify`,
  ]);
  app.addHook('onRequest', async (request, reply) => {
    // Canonical registered route, not user-supplied URL text: encoded paths cannot bypass this.
    const route = request.routeOptions.url;
    if (!route?.startsWith(`${API_BASE_PATH}/`)) return;
    reply.header('Cache-Control', 'no-store');
    const health = route === `${API_BASE_PATH}/health`;
    if (!health) checkCsrfOrigin(request, config, false);
    if (
      config.authMode !== 'local' &&
      (route.startsWith(`${API_BASE_PATH}/auth/mfa/`) ||
        (request.method === 'POST' &&
          [
            `${API_BASE_PATH}/auth/setup`,
            `${API_BASE_PATH}/auth/login`,
            `${API_BASE_PATH}/auth/logout`,
          ].includes(route)))
    )
      throw new AppError(
        403,
        config.authMode === 'proxy' ? 'AUTH_MANAGED_BY_PROXY' : 'AUTH_DISABLED',
        config.authMode === 'proxy'
          ? 'Authentication is managed by your gateway.'
          : 'Authentication is disabled.',
      );
    if (
      config.authMode !== 'none' &&
      !publicRoutes.has(`${request.method} ${route}`) &&
      !(proxyAuth ? proxyAuth.session(request) : auth.session(request.headers.cookie)).user
    )
      throw new AppError(401, 'UNAUTHORIZED', 'Sign in to access documentation.');
    if (unsafeMethod(request.method)) {
      checkCsrfOrigin(request, config, true);
      if (route !== `${API_BASE_PATH}/auth/setup`) {
        const session =
          noneSession ??
          (proxyAuth ? proxyAuth.session(request) : auth.session(request.headers.cookie));
        checkCsrfToken(request, session.csrfToken);
      }
    }
  });
  let watcher: ContentWatcher | undefined;
  app.addHook('onClose', async () => {
    await watcher?.close();
    db.close();
  });
  const registry = new DocumentRegistry(contentDir, {
    assignMissingIds: config.assignMissingIds,
    logger: app.log.child({ module: 'registry' }),
    db,
  });
  await registry.refresh();
  app.log.info({ contentDir, documents: registry.list().length }, 'Content loaded');
  const lock = new MutationLock();
  const sync = new ContentSync(registry, lock, app.log.child({ module: 'sync' }));
  const trash = new TrashService(contentDir);
  const templates = new TemplateService(contentDir);
  const seeded = await templates.seed();
  if (seeded.length > 0) app.log.info({ templates: seeded }, 'Created the built-in templates');
  const linkUpdater = new LinkUpdater(contentDir, registry, app.log.child({ module: 'links' }));
  const service = new DocumentService(
    contentDir,
    registry,
    trash,
    lock,
    linkUpdater,
    templates,
    sync,
  );
  const folders = new FolderService(contentDir, registry, trash, lock, linkUpdater);

  // Must be set before routes are registered so encapsulated plugins inherit it.
  // Uniform error body (PROJECT_SPEC §59); never leak stack traces to clients (§83).
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    let body: ApiErrorBody;
    let statusCode: number;
    if (error instanceof AppError) {
      statusCode = error.statusCode;
      body = { error: { code: error.code, message: error.message } };
      if (error.details) body.error.details = error.details;
    } else if ('validation' in error && error.validation) {
      statusCode = 400;
      body = { error: { code: 'VALIDATION_ERROR', message: error.message } };
    } else {
      const fastifyError = error as FastifyError;
      statusCode =
        fastifyError.statusCode && fastifyError.statusCode >= 400 ? fastifyError.statusCode : 500;
      body =
        statusCode >= 500
          ? { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } }
          : { error: { code: fastifyError.code ?? 'BAD_REQUEST', message: fastifyError.message } };
    }
    if (statusCode >= 500) request.log.error({ err: error }, 'Unhandled error');
    return reply.status(statusCode).send(body);
  });

  await app.register(attachmentRoutes, {
    prefix: API_BASE_PATH,
    attachments: new AttachmentService(contentDir, registry, lock, config.maxUploadSize),
    limit: config.maxUploadSize,
  });
  await app.register(healthRoutes, { prefix: API_BASE_PATH });
  await app.register(authRoutes, {
    prefix: API_BASE_PATH,
    auth,
    secureCookie: config.sessionCookieSecure,
    proxyAuth,
    noneSession,
  });
  await app.register(setupRoutes, {
    prefix: API_BASE_PATH,
    setup: new SetupService(db, contentDir, initialization),
    bypassSetup:
      config.authMode === 'local'
        ? undefined
        : { required: false, contentDir, authMode: config.authMode },
  });
  await app.register(documentRoutes, { prefix: API_BASE_PATH, registry, sync, service });
  await app.register(folderRoutes, { prefix: API_BASE_PATH, folders });
  await app.register(trashRoutes, { prefix: API_BASE_PATH, trash, service });
  await app.register(indexingRoutes, {
    prefix: API_BASE_PATH,
    registry,
    sync,
    dataDir: config.dataDir,
    contentDir,
    systemDir,
  });
  await app.register(templateRoutes, { prefix: API_BASE_PATH, templates });
  await app.register(pinRoutes, {
    prefix: API_BASE_PATH,
    sync,
    pins: new PinService(registry),
  });
  await app.register(linkRoutes, {
    prefix: API_BASE_PATH,
    sync,
    links: new LinkService(registry),
  });
  await app.register(searchRoutes, {
    prefix: API_BASE_PATH,
    sync,
    search: new SearchService(db),
  });

  if (config.webDistDir && existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    // SPA fallback: non-API GET requests get index.html when the web app is served.
    if (
      request.method === 'GET' &&
      !request.url.startsWith(API_BASE_PATH) &&
      config.webDistDir &&
      existsSync(config.webDistDir)
    ) {
      return reply.sendFile('index.html');
    }
    const body: ApiErrorBody = { error: { code: 'NOT_FOUND', message: 'Not found' } };
    return reply.status(404).send(body);
  });

  // PROJECT_SPEC §62: the watcher starts last, after the index is reconciled (P12-01).
  if (config.watchMode !== 'off') {
    watcher = new ContentWatcher(contentDir, sync, {
      mode: config.watchMode,
      logger: app.log.child({ module: 'watcher' }),
    });
    await watcher.start();
  }

  return app;
}
