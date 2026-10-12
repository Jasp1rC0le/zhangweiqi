import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElSelect } from 'element-plus'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/icon/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/message-box/style/css'
import 'element-plus/es/components/option/style/css'
import 'element-plus/es/components/select/style/css'

import App from './App.vue'
import router from './router'
import './styles/campthink.css'
import './styles/readability.css'
import './styles/confirmation.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

for (const component of [ElButton, ElForm, ElFormItem, ElIcon, ElInput, ElOption, ElSelect]) {
  app.component(component.name, component)
}

app.mount('#app')
