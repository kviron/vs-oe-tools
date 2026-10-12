import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

const entries: string[] = JSON.parse(readFileSync(new URL('./webview-ui/entries.json', import.meta.url), 'utf8'));

// The coordinator supplies one entry and a private staging directory per build.
export default defineConfig(({ mode }) => {
  if (!entries.includes(mode)) { throw new Error('Use npm run build:webview or npm run watch:webview.'); }
  return {
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    plugins: [vue(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./webview-ui/src', import.meta.url)) } },
    build: {
      emptyOutDir: true,
      cssCodeSplit: false,
      rollupOptions: {
        input: { [mode]: fileURLToPath(new URL(`./webview-ui/src/${mode}/main.ts`, import.meta.url)) },
        output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: asset => asset.name?.endsWith('.css') ? 'webview.css' : 'assets/[name]-[hash][extname]' },
      },
    },
  };
});
