import { readFileSync } from 'node:fs'

const ALLOWED = new Set(['onnxruntime-web'])
const DENY = [
  'openai', 'anthropic', '@anthropic-ai', 'langchain', 'tensorflow', '@tensorflow',
  'transformers', '@xenova', '@huggingface', 'tesseract', 'cohere',
  '@google/generative-ai', 'replicate', 'ollama',
]

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
const bad = names.filter((n) => !ALLOWED.has(n) && DENY.some((p) => n.toLowerCase().includes(p)))

if (bad.length > 0) {
  console.error('check:deps FAILED. AI/ML packages are forbidden (SPEC section 1):')
  for (const n of bad) console.error(`  - ${n}`)
  process.exit(1)
}
console.log(`check:deps OK (${names.length} packages checked, no AI/ML packages).`)
