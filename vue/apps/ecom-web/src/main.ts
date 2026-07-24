import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router/index.ts'
import { useAuthStore } from 'core/stores/auth'

const app = createApp(App)

app.use(createPinia())
app.use(router)

const authStore = useAuthStore()
authStore.initialize().finally(() => {
  app.mount('#app')
})
