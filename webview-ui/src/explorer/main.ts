import { createApp } from 'vue';
import App from './App.vue';
import '../styles.css';

document.documentElement.classList.toggle(
  'dark',
  document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast'),
);
document.documentElement.dataset.webviewBoot = 'started';

try {
  createApp(App).mount('#app');
  document.documentElement.dataset.webviewBoot = 'ready';
} catch (error) {
  document.documentElement.dataset.webviewBoot = 'failed';
  const root = document.getElementById('app');
  if (root) root.textContent = `Ошибка запуска проводника: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
}
