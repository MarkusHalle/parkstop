import { readFileSync } from 'node:fs'

const ALLOWED = new Set(['onnxruntime-web'])
const DENY = [
  'openai', 'anthropic', '@anthropic-ai', 'langchain', 'tensorflow', '@tensorflow',
  'transformers', '@xenova', '@huggingface', 'tesseract', 'cohere',
  '@google/generative-ai', '@google/genai', 'genai', 'replicate', 'ollama',
  '@ai-sdk', 'mistral', 'groq', 'web-llm', '@mlc-ai', 'onnxruntime', 'mediapipe',
  'face-api', 'llama', 'gpt', 'tiktoken',
]
// Names too short to match as substrings: compared exactly.
const DENY_EXACT = new Set(['ai', 'ml5', 'brain.js'])

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
const isBad = (n) => {
  const l = n.toLowerCase()
  return !ALLOWED.has(l) && (DENY_EXACT.has(l) || DENY.some((p) => l.includes(p)))
}
const bad = names.filter(isBad)

if (bad.length > 0) {
  console.error('check:deps FAILED. AI/ML packages are forbidden (SPEC section 1):')
  for (const n of bad) console.error(`  - ${n}`)
  process.exit(1)
}
console.log(`check:deps OK (${names.length} packages checked, no AI/ML packages).`)
