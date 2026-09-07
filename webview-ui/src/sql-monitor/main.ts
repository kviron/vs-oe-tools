import { createApp } from 'vue';
import App from './App.vue';
import '../styles.css';
import { applyVsCodeTheme } from '../vscodeTheme';

applyVsCodeTheme();
createApp(App).mount('#app');
