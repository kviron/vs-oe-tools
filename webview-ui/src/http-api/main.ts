import { createApp } from 'vue';
import '../styles.css';
import App from './App.vue';

function syncTheme(): void {
  document.documentElement.classList.toggle(
    'dark',
    document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast'),
  );
}
syncTheme();
new MutationObserver(syncTheme).observe(document.body, { attributes: true, attributeFilter: ['class'] });
createApp(App).mount('#app');
