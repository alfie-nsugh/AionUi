import path from 'path';
import { builtinModules } from 'module';
import { defineConfig } from 'vite';
import packageJson from './package.json';

const external = new Set<string>(['electron', ...builtinModules, ...builtinModules.map((mod) => `node:${mod}`), ...Object.keys(packageJson.dependencies ?? {}), ...Object.keys(packageJson.optionalDependencies ?? {})]);

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@common': path.resolve(__dirname, 'src/common'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@process': path.resolve(__dirname, 'src/process'),
      '@worker': path.resolve(__dirname, 'src/worker'),
    },
  },
  build: {
    target: 'node20',
    outDir: '.vite/preload',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/preload.ts'),
      formats: ['cjs'],
      fileName: () => 'index',
    },
    rollupOptions: {
      external: Array.from(external),
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
      },
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
  },
});
