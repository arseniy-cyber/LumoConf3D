import { writeFileSync } from 'node:fs'
import { catalog } from '../src/shared/catalog.ts'

const sql = value => `'${String(value).replaceAll("'", "''")}'`
const lines = ['-- LUMO local product models and images. Preserve store edits and original photos.']
for (const part of catalog) {
  const target = `store_id='lumo' AND id=${sql(part.id)}`
  if (part.modelUrl) {
    lines.push(
      `UPDATE products SET data=json_set(data, '$.modelUrl', ${sql(part.modelUrl)}, '$.modelStatus', 'approximation') WHERE ${target} AND NULLIF(json_extract(data, '$.modelUrl'), '') IS NULL;`,
    )
  }
  if (part.image) {
    lines.push(
      `UPDATE products SET data=json_set(data, '$.image', ${sql(part.image)}, '$.specs.imageKind', ${sql(part.specs.imageKind)}) WHERE ${target} AND NULLIF(json_extract(data, '$.image'), '') IS NULL;`,
    )
  }
  if (typeof part.specs.sceneDepthMm === 'number') {
    lines.push(`UPDATE products SET data=json_set(data, '$.specs.sceneDepthMm', ${Number(part.specs.sceneDepthMm)}) WHERE ${target} AND json_extract(data, '$.specs.sceneDepthMm') IS NULL;`)
  }
}
writeFileSync(new URL('../migrations/0003_catalog_assets.sql', import.meta.url), lines.join('\n') + '\n')
