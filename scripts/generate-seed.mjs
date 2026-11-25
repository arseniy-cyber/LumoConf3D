import { writeFileSync } from 'node:fs'
import { catalog, presets } from '../src/shared/catalog.ts'

function quote(value) {
  if (!value && value !== '') throw new TypeError('Empty seed field')
  return `'${String(value).replaceAll("'", "''")}'`
}

const tables = [
  {
    table: 'products',
    columns: ['store_id', 'id', 'category', 'name', 'data'],
    entries: catalog.map(part => ['lumo', part.id, part.category, part.name, JSON.stringify(part)]),
  },
  {
    table: 'presets',
    columns: ['store_id', 'id', 'name', 'data'],
    entries: presets.map(preset => ['lumo', preset.id, preset.name, JSON.stringify(preset)]),
  },
]
const result = ['-- Initial LUMO catalog and presets. Application changes use later migrations.']
for (const { table, columns, entries } of tables) {
  for (const fields of entries) {
    result.push(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${fields.map(quote).join(',')});`)
  }
}
writeFileSync(new URL('../migrations/0002_catalog.sql', import.meta.url), result.join('\n') + '\n')
