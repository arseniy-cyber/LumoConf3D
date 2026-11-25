import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PageSizes, rgb, type PDFFont } from 'pdf-lib'
import type { Part } from '../shared/types'
import { labels, money } from './state'

interface Report {
  name: string
  parts: Part[]
  currency: string
  total: number
  services: { name: string; price: number }[]
  discount: number
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/)
  const lines = ['']
  for (const word of words) {
    const i = lines.length - 1
    const joined = lines[i] ? `${lines[i]} ${word}` : word
    if (font.widthOfTextAtSize(joined, size) <= width) lines[i] = joined
    else {
      if (lines[i]) lines.push('')
      for (const char of word) {
        const row = lines.length - 1
        if (font.widthOfTextAtSize(lines[row] + char, size) > width) lines.push(char)
        else lines[row] += char
      }
    }
  }
  return lines
}

export async function createBuildPdf(report: Report) {
  const source = await fetch('/fonts/manrope-pdf.ttf')
  if (!source.ok) throw new Error('Шрифт PDF недоступен.')
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(await source.arrayBuffer(), { subset: true })
  const glyphs = new Set(font.getCharacterSet())
  const printable = (text: string) => Array.from(text, char => glyphs.has(char.codePointAt(0)!) ? char : glyphs.has(0xfffd) ? '�' : '?').join('')
  const title = printable(report.name)
  pdf.setTitle(title)
  pdf.setCreator('LUMO PC Builder')

  const violet = rgb(.34, .21, .60)
  const dark = rgb(.12, .11, .16)
  const muted = rgb(.34, .33, .40)
  const rule = rgb(.88, .86, .91)
  const margin = 44
  const [width, height] = PageSizes.A4
  let page = pdf.addPage(PageSizes.A4)
  let y = height - margin

  function line(text: string, x: number, size: number, color = dark) {
    page.drawText(printable(text), { x, y, size, font, color })
  }

  function amount(value: number, size = 11) {
    const text = printable(money(value, report.currency))
    line(text, width - margin - font.widthOfTextAtSize(text, size), size)
  }

  function separator() {
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, color: rule, thickness: .8 })
  }

  function nextPageIfNeeded(space: number) {
    if (y > margin + space) return
    page = pdf.addPage(PageSizes.A4)
    y = height - margin
    line('LUMO PC BUILDER', margin, 11, violet)
    y -= 26
  }

  line('LUMO PC BUILDER', margin, 11, violet)
  y -= 35
  for (const segment of wrap(title, font, 25, width - 2 * margin)) {
    line(segment, margin, 25)
    y -= 30
  }
  y -= 12
  const rows = [
    ...report.parts.map(part => ({ label: labels[part.category], name: part.name, price: part.price })),
    ...report.services.map(service => ({ label: 'Услуга', name: service.name, price: service.price })),
  ]
  for (const item of rows) {
    const lines = wrap(printable(item.name), font, 11, width - margin * 2 - 254)
    const space = Math.max(30, lines.length * 14 + 16)
    nextPageIfNeeded(space)
    line(item.label, margin, 10, muted)
    amount(item.price)
    for (const segment of lines) {
      line(segment, margin + 142, 11)
      y -= 14
    }
    y -= 5
    separator()
    y -= space - lines.length * 14 - 5
  }

  nextPageIfNeeded(95)
  if (report.discount > 0) {
    y -= 7
    line('Скидка', margin, 11, muted)
    amount(-report.discount)
    y -= 24
  }
  y -= 16
  line('Итого', margin, 17)
  amount(report.total, 17)
  if (report.parts.some(part => part.priceStatus === 'demo')) {
    y -= 25
    line('В каталоге используются демонстрационные цены и остатки.', margin, 10, muted)
  }
  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes).buffer], { type: 'application/pdf' })
}
