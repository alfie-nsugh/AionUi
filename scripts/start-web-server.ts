#!/usr/bin/env ts-node
/**
 * Standalone WebUI backend launcher (no Electron window required).
 * Designed for browser-only development flows.
 */
import 'dotenv/config'; // Load .env file from AionUi root
import path from 'path';
import { startWebServer } from '../src/webserver';
import { SERVER_CONFIG } from '../src/webserver/config/constants';

const args = process.argv.slice(2);

const hasFlag = (flag: string): boolean => args.includes(`--${flag}`);
const getArgValue = (flag: string): string | undefined => {
  const withEquals = args.find((arg) => arg.startsWith(`--${flag}=`));
  if (withEquals) {
    return withEquals.split('=')[1];
  }

  const index = args.indexOf(`--${flag}`);
  if (index !== -1 && args[index + 1] && !args[index + 1].startsWith('--')) {
    return args[index + 1];
  }

  return undefined;
};

const parseBool = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parsePort = (value: string | undefined, fallback: number): number => {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : fallback;
};

const port = parsePort(getArgValue('port') || process.env.AIONUI_PORT || process.env.PORT, SERVER_CONFIG.DEFAULT_PORT);
const allowRemote = hasFlag('remote') || parseBool(process.env.AIONUI_ALLOW_REMOTE || process.env.AIONUI_REMOTE);
const skipStatic = hasFlag('dev') || hasFlag('skip-static') || parseBool(process.env.AIONUI_SKIP_STATIC);
const wsPath = getArgValue('ws-path') || process.env.AIONUI_WS_PATH || (skipStatic ? '/bridge' : undefined);
const devOrigin =
  getArgValue('dev-origin') ||
  process.env.AIONUI_DEV_ORIGIN ||
  (skipStatic ? `http://localhost:${process.env.AIONUI_DEV_PORT || process.env.PORT || 3000}` : undefined);
const staticRoot = getArgValue('static-root') || process.env.AIONUI_STATIC_ROOT;
const indexHtml = getArgValue('index-html') || process.env.AIONUI_INDEX_HTML;
const autoOpen = hasFlag('no-open') ? false : true;

const extraAllowedOrigins = devOrigin ? [devOrigin] : [];

console.log(`[web] Starting backend on ${allowRemote ? '0.0.0.0' : '127.0.0.1'}:${port}${skipStatic ? ' (API only, no static assets)' : ''}`);
if (devOrigin) {
  console.log(`[web] Allowing dev origin: ${devOrigin}`);
}
if (wsPath) {
  console.log(`[web] WebSocket path: ${wsPath}`);
}
if (staticRoot) {
  console.log(`[web] Static root override: ${path.resolve(staticRoot)}`);
}

void startWebServer(port, allowRemote, {
  skipStatic,
  wsPath,
  extraAllowedOrigins,
  staticRoot: staticRoot ? path.resolve(staticRoot) : undefined,
  indexHtml: indexHtml ? path.resolve(indexHtml) : undefined,
  autoOpen,
}).catch((error) => {
  console.error('❌ Failed to start web server', error);
  process.exit(1);
});
