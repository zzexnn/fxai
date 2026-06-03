/**
 * 应用入口
 * 导入样式、初始化 App
 */

import './styles/variables.css';
import './styles/base.css';
import './styles/components.css';
import './styles/pages.css';
import { createApp } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  createApp(app);
});
