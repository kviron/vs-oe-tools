import { createApp } from 'vue';
import App from './App.vue';
import '../styles.css';

document.documentElement.classList.toggle(
	'dark',
	document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast'),
);

createApp(App).mount('#app');
