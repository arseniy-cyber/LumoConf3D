import React from 'react'
import { createRoot } from 'react-dom/client'
import { Builder } from './builder/Builder'
import './style.css'

const root = document.querySelector<HTMLElement>('#app')
if (!root) throw new Error('Missing application root')

if (/^\/admin(?:\/|$)/.test(location.pathname)) {
  import('./admin/index').then(({ mountAdmin }) => mountAdmin(root)).catch(() => {
    root.textContent = 'Административная панель временно недоступна.'
  })
} else {
  createRoot(root).render(<React.StrictMode><Builder /></React.StrictMode>)
}
