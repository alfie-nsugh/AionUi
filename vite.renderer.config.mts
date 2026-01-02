import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import UnoCSS from 'unocss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const parsePort = (value: string | undefined, fallback: number): number => {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : fallback;
};

const normalizeWsPath = (input?: string | null): string => {
  if (!input) return '';
  if (input === '/') return '/';
  return input.startsWith('/') ? input : `/${input}`;
};

const iconParkImportRe = /import\s+\{\s+([a-zA-Z0-9_,\s]+)\s+\}\s+from\s+['"]@icon-park\/react['"]\s*;?/g;

const iconParkHOCPlugin = (): Plugin => ({
  name: 'aionui-icon-park-hoc',
  enforce: 'pre',
  transform(code, id) {
    if (!id.match(/\.[jt]sx?$/)) return null;
    if (!code.includes('@icon-park/react')) return null;

    let needsHocImport =
      !code.includes("from '@renderer/components/IconParkHOC'") &&
      !code.includes('from "@renderer/components/IconParkHOC"');

    const transformed = code.replace(iconParkImportRe, (full, names) => {
      const components = names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);

      if (components.length === 0) {
        return full;
      }

      const importComponent = full.replace(
        names,
        components.map((name) => `${name} as _${name}`).join(', ')
      );
      const hocImport = needsHocImport ? "import IconParkHOC from '@renderer/components/IconParkHOC';\n" : '';
      needsHocImport = false;
      const hocDefs = components.map((name) => `const ${name} = IconParkHOC(_${name});`).join('\n');

      return `${importComponent}\n${hocImport}${hocDefs}`;
    });

    return transformed === code ? null : transformed;
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devServerPort = parsePort(env.PORT || env.AIONUI_DEV_PORT, 3000);
  const devServerHost = env.AIONUI_DEV_HOST || env.HOST || '127.0.0.1';
  const wsPath = normalizeWsPath(env.AIONUI_WS_PATH || '/bridge');

  return {
    root: path.resolve(__dirname),
    base: './',
    plugins: [
      react(),
      UnoCSS(),
      iconParkHOCPlugin(),
      nodePolyfills({
        protocolImports: true,
        globals: {
          Buffer: true,
          process: true,
        },
      }),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, 'src') },
        { find: '@common', replacement: path.resolve(__dirname, 'src/common') },
        { find: '@renderer', replacement: path.resolve(__dirname, 'src/renderer') },
        { find: '@process', replacement: path.resolve(__dirname, 'src/process') },
        { find: '@worker', replacement: path.resolve(__dirname, 'src/worker') },
        { find: 'process/browser', replacement: 'process/browser.js' },
        { find: 'streamdown', replacement: path.resolve(__dirname, 'node_modules/streamdown/dist/index.js') },
        {
          find: /^diff2html$/,
          replacement: path.resolve(__dirname, 'node_modules/diff2html/bundles/js/diff2html.min.js'),
        },
      ],
    },
    define: {
      global: 'globalThis',
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.env': JSON.stringify(env.env),
      'process.env.AIONUI_WS_URL': JSON.stringify(env.AIONUI_WS_URL || ''),
      'process.env.AIONUI_WS_HOST': JSON.stringify(env.AIONUI_WS_HOST || ''),
      'process.env.AIONUI_WS_PATH': JSON.stringify(wsPath),
    },
    server: {
      port: devServerPort,
      host: devServerHost,
      strictPort: true,
    },
    build: {
      outDir: '.vite/renderer/main_window',
      emptyOutDir: true,
      sourcemap: mode !== 'production',
    },
    publicDir: 'public',
    assetsInclude: ['**/*.wasm'],
  };
});
