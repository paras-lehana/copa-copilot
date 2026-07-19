// main.ts — process entry point: load config from the environment and listen.
// This is the only file that touches process.env (via loadConfig) or a socket.

import { loadConfig } from './config';
import { logEvent, stdoutSink } from './middleware/logger';
import { buildApp } from './server';
import { hasCriticalFinding, runSecuritySelfTest } from './services/security-selftest';

const config = loadConfig(process.env);

// Fail-closed security gate: audit the assembled config BEFORE binding a socket.
// Warnings are logged and tolerated; a critical misconfiguration in production
// (wildcard CORS, plaintext upstream) aborts startup rather than serving unsafely.
const findings = runSecuritySelfTest(config, { isProduction: config.isProduction });
for (const f of findings) {
  logEvent(stdoutSink, config.now, f.severity === 'critical' ? 'ERROR' : 'WARNING', `security: ${f.id} — ${f.message}`);
}
if (config.isProduction && hasCriticalFinding(findings)) {
  logEvent(stdoutSink, config.now, 'ERROR', 'security: refusing to start with critical findings');
  process.exit(1);
}

const app = buildApp(config);

app.listen(config.port, () => {
  logEvent(stdoutSink, config.now, 'INFO', `copa-copilot-api listening on :${config.port}`);
});
