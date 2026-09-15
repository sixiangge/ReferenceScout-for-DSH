import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const target = resolve(process.cwd(), 'lib')
if (target !== resolve(process.cwd(), 'lib')) throw new Error('unexpected clean target')
await rm(target, { recursive: true, force: true })
