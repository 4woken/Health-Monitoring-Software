import { cpSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url))
const target = fileURLToPath(new URL('../public/face/wasm/', import.meta.url))
mkdirSync(target, { recursive: true })
cpSync(source, target, { recursive: true })
