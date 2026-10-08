import { APP_NAME } from '@leandocs/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config/config.js';
import { SERVER_VERSION } from './version.js';

const config = loadConfig();
// buildApp creates DATA_DIR/content and DATA_DIR/system (PROJECT_SPEC §77) and loads the content.
const app = await buildApp(config);
app.log.info({ version: SERVER_VERSION }, `Starting ${APP_NAME} ${SERVER_VERSION}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'Shutting down');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.fatal(error);
  process.exit(1);
}
