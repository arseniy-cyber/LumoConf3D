import { existsSync, statSync, writeFileSync } from 'node:fs'
import { catalog, presets } from '../src/shared/catalog.ts'

const output = new URL('../ASSETS.md', import.meta.url)
const photos = catalog.filter(part => part.specs.imageKind === 'photograph')
const renders = catalog.filter(part => part.specs.imageKind === 'render')
const models = catalog.filter(part => part.modelUrl)
const format = number => new Intl.NumberFormat('ru-RU').format(Math.round(number))
const space = file => format(statSync(new URL(`../public${file}`, import.meta.url)).size / 1024)
const h = '# Реестр материалов и комплектующих'
const description = `Каталог LUMO содержит ${catalog.length} реально существующих комплектующих и ${presets.length} стартовых вариантов. В приложении используются ${models.length} локальных GLB, ${photos.length} лицензированных фотографий или видеокадров и ${renders.length} авторских визуализаций. Все продуктовые GLB имеют статус авторской аппроксимации. Даты в таблице относятся к сведениям источников каталога.`
const sources = [
  'Модели подготовлены в Blender, используют PBR-материалы и Meshopt. Они не содержат моделей, текстур или фотографий, выгруженных с закрытых площадок. Авторские визуализации получены из подготовленных моделей. Права изготовителей на обозначения и условия распространения источников сохраняются. Публичный список авторов, лицензий и изменений указан для каждой фотографии. [Атрибуция изображений](public/asset-credits.html)',
  'Рассмотренные и исключённые материалы описаны отдельно. Для ряда реальных комплектующих разрешение на коммерческую перепубликацию точного фото пока не подтверждено. Для них в каталоге используется подписанная визуализация. [Исследование референсов](docs/ASSET_RESEARCH.md) · [Источники каталога](docs/CATALOG_SOURCES.md)',
  'Техническая документация отражает происхождение, особенности и ограничения отдельных семейств моделей. [Общий реестр](docs/ASSET_RESEARCH.md) · [Видеокарты](docs/GPU_ASSETS.md) · [Воздушное охлаждение](docs/COOLING_ASSETS.md) · [Платы, блоки питания, память, накопители и СВО](docs/EXTRA_MODELS.md)',
  'Шрифты интерфейса и PDF — Manrope, SIL Open Font License 1.1. Встроены две веб-подвыборки и подвыборка TTF с кириллицей для PDF, полученная из официального файла Manrope. Знак LUMO создан для проекта. [Шрифт](https://github.com/google/fonts/tree/main/ofl/manrope) · [Копия OFL](public/fonts/Manrope-OFL.txt)',
]
const table = [
  '| Позиция | Габариты из каталога, мм | GLB, КиБ | Изображение | Проверка | Источник |',
  '| --- | --- | ---: | --- | --- | --- |',
]
for (const part of catalog) {
  const dim = part.dimensions
  const dimensions = dim ? `${dim.width} × ${dim.height} × ${dim.depth}` : part.specs.widthMm && part.specs.heightMm ?
    `${part.specs.widthMm} × ${part.specs.heightMm} (плоскость)` : 'По механическому формату корпуса'
  const image = part.image ? `[${part.specs.imageKind === 'render' ? 'Визуализация' : 'Фото или кадр'}](public/asset-credits.html#${part.id})` : 'Открытая позиция'
  const glb = part.modelUrl && existsSync(new URL(`../public${part.modelUrl}`, import.meta.url)) ?
    `[${space(part.modelUrl)}](public${part.modelUrl})` : '—'
  table.push(`| ${part.name} | ${dimensions} | ${glb} | ${image} | ${part.checkedAt} | [Производитель](${part.source}) |`)
}
writeFileSync(output, [h, description, ...sources, '## Каталог', table.join('\n')].join('\n\n') + '\n')
