import { createApp } from 'vue';
import '../styles.css';
import App from './App.vue';
import { applyVsCodeTheme } from '../vscodeTheme';

applyVsCodeTheme();
createApp(App).mount('#app');
