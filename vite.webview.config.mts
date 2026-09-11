import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const entryNames = [
  'explorer',
  'production-tasks',
  'production-task-details',
  'package-sync',
  'svn-conflict',
  'class-details',
  'class-objects',
  'object-view',
  'package-content',
  'attribute-details',
  'property-details',
  'entity-properties',
  'sql-monitor',
  'sql-executor',
  'native-logs',
  'code-history',
  'settings',
  'spu-editor',
] as const;

const entries = Object.fromEntries(entryNames.map(name => [
  name,
  fileURLToPath(new URL(`./webview-ui/src/${name}/main.ts`, import.meta.url)),
]));

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./webview-ui/src', import.meta.url)),
    },
  },
  build: {
    emptyOutDir: true,
    outDir: 'dist/webview',
    cssCodeSplit: false,
    rollupOptions: {
      input: entries,
      output: {
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: asset => asset.name?.endsWith('.css') ? 'webview.css' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});
