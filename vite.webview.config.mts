import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  const isClassDetails = mode === 'class-details';
  const entryName = isClassDetails ? 'class-details' : 'explorer';
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
    emptyOutDir: !isClassDetails,
    outDir: 'dist/webview',
    lib: {
      entry: fileURLToPath(new URL(`./webview-ui/src/${entryName}/main.ts`, import.meta.url)),
      formats: ['iife'],
      name: isClassDetails ? 'VcVeToolsClassDetails' : 'VcVeToolsExplorer',
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
