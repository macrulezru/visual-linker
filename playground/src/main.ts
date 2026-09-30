import { createApp } from 'vue'
import { VisualLinkerPlugin } from '@macrulez/visual-linker-vue'
import App from './App.vue'
import './style.css'

createApp(App).use(VisualLinkerPlugin).mount('#app')
