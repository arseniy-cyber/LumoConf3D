import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { catalog, presets } from '../src/shared/catalog.ts'
import { checkCompatibility } from '../src/shared/compatibility.ts'
import { categories, type Category } from '../src/shared/types.ts'

const requiredCounts: Record<Category, number> = {
  case: 5, gpu: 10, cpu: 10, motherboard: 6, ram: 6, cooler: 6, psu: 5, storage: 5, fan: 5,
}

test('initial catalog covers all categories and each record has unique product identity and provenance', () => {
  assert.equal(new Set(catalog.map(({ id }) => id)).size, catalog.length)
  for (const category of categories) {
    assert.ok(catalog.filter(item => item.category === category).length >= requiredCounts[category], category)
  }
  for (const item of catalog) {
    assert.match(item.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(item.brand && item.model && item.name && item.colors.length, item.id)
    assert.equal(new URL(item.source).protocol, 'https:')
    assert.match(item.checkedAt, /^\d{4}-\d{2}-\d{2}$/)
    assert.equal(item.priceStatus, 'demo')
    assert.ok(Number.isSafeInteger(item.price) && item.price > 0, item.id)
    if (item.dimensions) {
      assert.ok(Object.values(item.dimensions).every(size => Number.isFinite(size) && size > 0), item.id)
    }
  }
})

test('selected presets resolve available records and have no known hard compatibility conflict', () => {
  const parts = new Map(catalog.map(part => [part.id, part]))
  const presetsWithEveryCategory = presets.filter(preset => Object.keys(preset.build).length === categories.length)
  assert.ok(presetsWithEveryCategory.length >= 5)
  assert.equal(new Set(presets.map(({ id }) => id)).size, presets.length)
  for (const preset of presets) {
    for (const category of categories) {
      const id = preset.build[category]
      if (id) {
        assert.equal(parts.get(id)?.category, category, `${preset.id}: ${id}`)
        assert.equal(parts.get(id)?.inStock, true, `${preset.id}: ${id}`)
      }
    }
    if (presetsWithEveryCategory.includes(preset)) {
      const { issues } = checkCompatibility(preset.build, catalog)
      const conflicts = issues.filter(issue => issue.severity === 'incompatible')
      assert.deepEqual(conflicts, [], preset.id)
    }
  }
})

test('catalog image and model URLs are local files with supported formats', () => {
  const credits = readFileSync(new URL('../public/asset-credits.html', import.meta.url), 'utf8')
  for (const item of catalog) {
    if (item.image) {
      assert.match(item.image, /^\/images\/parts\/[a-z0-9-]+\.webp$/)
      const file = readFileSync(new URL(`../public${item.image}`, import.meta.url))
      assert.equal(file.toString('ascii', 0, 4), 'RIFF')
      assert.equal(file.toString('ascii', 8, 12), 'WEBP')
      assert.ok(item.specs.imageKind === 'photograph' || item.specs.imageKind === 'render', item.id)
      assert.ok(credits.includes(`id="${item.id}"`), `Missing public credit for ${item.id}`)
    }
    if (item.modelUrl) {
      assert.ok(item.modelStatus, item.id)
      assert.match(item.modelUrl, /^\/models\/[a-z0-9-]+\.glb$/)
      const file = readFileSync(new URL(`../public${item.modelUrl}`, import.meta.url))
      assert.equal(file.toString('ascii', 0, 4), 'glTF')
      assert.equal(file.readUInt32LE(4), 2)
      assert.equal(file.readUInt32LE(8), file.length)
    }
  }
})
