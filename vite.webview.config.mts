import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const entryName = mode === 'class-details' || mode === 'class-objects' || mode === 'object-view' || mode === 'attribute-details' || mode === 'property-details' || mode === 'entity-properties' || mode === 'sql-monitor' || mode === 'sql-executor' || mode === 'code-history' || mode === 'package-sync' || mode === 'settings' ? mode : 'explorer';
  return {
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
    emptyOutDir: entryName === 'explorer',
    outDir: 'dist/webview',
    lib: {
      entry: fileURLToPath(new URL(`./webview-ui/src/${entryName}/main.ts`, import.meta.url)),
      formats: ['iife'],
      name: entryName === 'class-details'
        ? 'VcVeToolsClassDetails'
        : entryName === 'class-objects'
          ? 'VcVeToolsClassObjects'
        : entryName === 'object-view'
          ? 'VcVeToolsObjectView'
        : entryName === 'attribute-details'
          ? 'VcVeToolsAttributeDetails'
        : entryName === 'property-details'
          ? 'VcVeToolsPropertyDetails'
        : entryName === 'entity-properties'
          ? 'VcVeToolsEntityProperties'
        : entryName === 'sql-monitor'
          ? 'VcVeToolsSqlMonitor'
          : entryName === 'sql-executor'
            ? 'VcVeToolsSqlExecutor'
            : entryName === 'code-history'
              ? 'VcVeToolsCodeHistory'
            : entryName === 'package-sync'
              ? 'VcVeToolsPackageSync'
            : entryName === 'settings'
              ? 'VcVeToolsSettings'
            : 'VcVeToolsExplorer',
    },
    rollupOptions: {
      output: {
        entryFileNames: `${entryName}.js`,
        assetFileNames: `${entryName}.[ext]`,
      },
    },
  },
  };
});
