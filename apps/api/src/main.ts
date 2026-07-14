// main.ts — process entry point: load config from the environment and listen.
// This is the only file that touches process.env (via loadConfig) or a socket.

import { loadConfig } from './config';
import { logEvent, stdoutSink } from './middleware/logger';
import { buildApp } from './server';

const config = loadConfig(process.env);
const app = buildApp(config);

app.listen(config.port, () => {
  logEvent(stdoutSink, config.now, 'INFO', `copa-copilot-api listening on :${config.port}`);
});
