import path from 'path';
import type { Configuration, WebpackPluginInstance } from 'webpack';
import webpack from 'webpack';
import type { Configuration as DevServerConfiguration } from 'webpack-dev-server';
import type { IncomingMessage } from 'http';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { rendererConfig as baseRendererConfig } from './webpack.renderer.config';

const isDevelopment = process.env.NODE_ENV !== 'production';

const parsePort = (value: string | undefined, fallback: number): number => {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port < 65536 ? port : fallback;
};

const normalizeWsPath = (input?: string | null): string => {
  if (!input) return '';
  if (input === '/') return '/';
  return input.startsWith('/') ? input : `/${input}`;
};

const devServerPort = parsePort(process.env.PORT || process.env.AIONUI_DEV_PORT, 3000);
const devServerHost = process.env.AIONUI_DEV_HOST || process.env.HOST || '127.0.0.1';
const backendPort = parsePort(process.env.AIONUI_BACKEND_PORT || process.env.AIONUI_PORT, 25808);
const backendHost = process.env.AIONUI_BACKEND_HOST || '127.0.0.1';
const wsPath = normalizeWsPath(process.env.AIONUI_WS_PATH || '/bridge');

const basePlugins = (baseRendererConfig.plugins ?? []) as WebpackPluginInstance[];

const plugins: WebpackPluginInstance[] = [
  ...basePlugins,
  new HtmlWebpackPlugin({
    template: path.resolve(__dirname, '../../public/index.html'),
  }),
  new webpack.DefinePlugin({
    'process.env.AIONUI_WS_URL': JSON.stringify(process.env.AIONUI_WS_URL || ''),
    'process.env.AIONUI_WS_HOST': JSON.stringify(process.env.AIONUI_WS_HOST || ''),
    'process.env.AIONUI_WS_PATH': JSON.stringify(wsPath),
  }),
];

const config: Configuration & { devServer?: DevServerConfiguration } = {
  ...baseRendererConfig,
  target: 'web',
  mode: isDevelopment ? 'development' : 'production',
  devtool: isDevelopment ? 'source-map' : false,
  entry: path.resolve(__dirname, '../../src/renderer/index.ts'),
  output: {
    path: path.resolve(__dirname, '../../dist/browser'),
    filename: isDevelopment ? '[name].js' : '[name].[contenthash].js',
    publicPath: '/',
    clean: true,
  },
  externals: undefined,
  plugins,
  devServer: {
    port: devServerPort,
    host: devServerHost,
    historyApiFallback: true,
    hot: true,
    static: path.resolve(__dirname, '../../public'),
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
    allowedHosts: 'all',
    proxy: [
      {
        context: (pathname: string) => ['/api', '/login', '/logout'].some((prefix) => pathname.startsWith(prefix)),
        target: `http://${backendHost}:${backendPort}`,
        changeOrigin: true,
      },
      ...(wsPath
        ? [
            {
              context: (pathname: string, req: IncomingMessage) => {
                const upgradeHeader = req.headers?.upgrade;
                const isWebSocket = typeof upgradeHeader === 'string' && upgradeHeader.toLowerCase() === 'websocket';
                return Boolean(isWebSocket && pathname.startsWith(wsPath));
              },
              target: `ws://${backendHost}:${backendPort}`,
              ws: true,
              changeOrigin: true,
            },
          ]
        : []),
    ],
  },
};

export default config;
