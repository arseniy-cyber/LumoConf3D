import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowRight, CheckCircle2, CircleAlert, FileDown } from 'lucide-react'
import { api, type Store } from './api'
import { Modal } from './Catalog'
import type { Build, MountLocation, Part } from '../shared/types'
import { labels, money } from './state'

interface TurnstileWidget {
  render: (element: HTMLElement, options: { sitekey: string; action: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void; theme: string }) => string
  reset: (handle: string) => void
  remove: (handle: string) => void
}
declare global {
  interface Window { turnstile?: TurnstileWidget }
}

export function Checkout({ store, build, parts, blocked, total, fanLocation, close }: {
  store: Store; build: Build; parts: Part[]; blocked: boolean; total: number; fanLocation: MountLocation; close: () => void
}) {
  const [services, setServices] = useState<string[]>([])
  const [promoCode, setPromoCode] = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState<{ id: string; total: number; currency: string }>()
  const [quote, setQuote] = useState<number>()
  const challenge = useRef<HTMLDivElement>(null)
  const widget = useRef<string>('')
  const orderAttempt = useRef<{ payload: string; key: string }>(undefined)
  const availableServices = store.assemblyFee > 0
    ? [{ id: 'assembly', name: 'Услуга сборки', price: store.assemblyFee }, ...store.services]
    : store.services
  const displayedTotal = quote ?? total + availableServices.filter(service => services.includes(service.id)).reduce((sum, service) => sum + service.price, 0)
  const options = { fanLocation }

  useEffect(() => {
    const mount = challenge.current
    const key = store.turnstileSiteKey
    if (!mount || !key || blocked || !store.checkoutEnabled) return
    const render = () => {
      if (mount.isConnected && window.turnstile && !widget.current) {
        widget.current = window.turnstile.render(mount, {
          sitekey: key, action: 'quote_order', theme: 'dark', callback: setToken,
          'expired-callback': () => setToken(''), 'error-callback': () => setError('Проверка Cloudflare Turnstile недоступна.'),
        })
      }
    }
    if (window.turnstile) render()
    else {
      let script = document.querySelector<HTMLScriptElement>('#lumo-turnstile')
      if (!script) {
        script = document.createElement('script')
        script.id = 'lumo-turnstile'
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        script.async = true
        document.head.append(script)
      }
      script.addEventListener('load', render, { once: true })
      const onError = () => setError('Проверка Cloudflare Turnstile не загрузилась.')
      script.addEventListener('error', onError, { once: true })
      return () => {
        script.removeEventListener('load', render)
        script.removeEventListener('error', onError)
        if (widget.current) window.turnstile?.remove(widget.current)
        widget.current = ''
      }
    }
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = ''
    }
  }, [store.turnstileSiteKey, store.checkoutEnabled, blocked])

  async function requestQuote() {
    setError('')
    try {
      const result = await api<{ pricing: { total: number } }>('/quote', { parts: build, services, promoCode, options })
      setQuote(result.pricing.total)
    } catch (failure) {
      setError((failure as Error).message)
      setQuote(undefined)
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !token || blocked || !store.checkoutEnabled) return
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const customer = Object.fromEntries([...form.entries()].flatMap(([key, field]) => typeof field === 'string' && field.trim() ? [[key, field.trim()]] : []))
      if (!customer.email && !customer.phone) {
        setError('Укажите электронную почту или телефон.')
        return
      }
      if (promoCode.trim() && quote === undefined) {
        setError('Пересчитайте стоимость с промокодом перед отправкой.')
        return
      }
      const request = { parts: build, services, promoCode, options, customer, expectedTotal: displayedTotal }
      const payload = JSON.stringify(request)
      if (orderAttempt.current?.payload !== payload) orderAttempt.current = { payload, key: crypto.randomUUID() }
      const result = await api<{ order: { id: string; total: number; currency: string } }>('/orders', {
        ...request, turnstileToken: token,
      }, { 'Idempotency-Key': orderAttempt.current.key })
      setOrder(result.order)
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = ''
    } catch (failure) {
      setError((failure as Error).message)
      setToken('')
      if (widget.current) window.turnstile?.reset(widget.current)
    } finally {
      setBusy(false)
    }
  }

  return <Modal title="Итоги сборки" close={close}>
    {order ? <div className="order-confirmation"><CheckCircle2 size={36} /><h3>Заявка принята</h3><p>Номер {order.id}</p><strong>{money(order.total, order.currency)}</strong></div> : <>
      <div className="order-list">
        {parts.map(part => <div key={part.id}><span>{labels[part.category]}<strong>{part.name}</strong></span><strong>{money(part.price, store.currency)}</strong></div>)}
      </div>
      <div className="order-total"><span>{quote == null ? 'Стоимость комплектации' : 'Расчёт магазина'}</span><strong>{money(displayedTotal, store.currency)}</strong></div>
      {parts.some(part => part.priceStatus === 'demo') && <p className="muted">В каталоге используются демонстрационные цены и остатки.</p>}
      {blocked && <p className="notice warn"><CircleAlert size={16} /> Выберите обязательные компоненты и устраните конфликты совместимости.</p>}
      {!store.checkoutEnabled && <p className="notice"><CircleAlert size={16} /> Приём заявок магазином пока не подключён.</p>}
      {store.checkoutEnabled && !blocked && <form className="order-form" onSubmit={submit}>
        {availableServices.map(service => <label className="setting-toggle" key={service.id}>
          <span>{service.name} · {money(service.price, store.currency)}</span>
          <input type="checkbox" checked={services.includes(service.id)} onChange={event => {
            setQuote(undefined)
            setServices(current => event.target.checked ? [...current, service.id] : current.filter(id => id !== service.id))
          }} />
        </label>)}
        <div className="promo-field"><input type="text" aria-label="Промокод" placeholder="Промокод" maxLength={32} value={promoCode} onChange={event => { setPromoCode(event.target.value); setQuote(undefined) }} />
          <button type="button" className="button compact" onClick={requestQuote}>Пересчитать</button></div>
        <label>Имя<input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>
        <label>Электронная почта<input name="email" type="email" autoComplete="email" maxLength={200} /></label>
        <label>Телефон<input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
        <label>Комментарий<textarea name="comment" maxLength={1000} rows={2} /></label>
        <div ref={challenge} />
        <button className="button primary" type="submit" disabled={!token || busy}>{busy ? 'Отправка…' : 'Оставить заявку'}<ArrowRight size={16} /></button>
      </form>}
      {error && <p className="notice danger" role="alert"><CircleAlert size={16} /> {error}</p>}
      <div className="modal-actions"><button className="button" onClick={() => window.print()}><FileDown size={16} /> Печать / PDF</button></div>
    </>}
  </Modal>
}
