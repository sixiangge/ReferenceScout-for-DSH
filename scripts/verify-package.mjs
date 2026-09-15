import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const required = [
  'lib/index.js',
  'lib/client.js',
  'lib/types/index.d.ts',
  'lib/types/client/index.d.ts',
  'cordis.patch.yml',
]

for (const relative of required) {
  await readFile(resolve(process.cwd(), relative))
}

const client = await readFile(resolve(process.cwd(), 'lib/client.js'), 'utf8')
if (!client.includes('window.__ModuleLoader__.load')) {
  throw new Error('client bundle is not a DSH lazy-CJS factory artifact')
}
if (!client.includes('dsh-reference-scout')) {
  throw new Error('client bundle does not advertise the package id')
}

process.stdout.write('package artifacts verified\n')
