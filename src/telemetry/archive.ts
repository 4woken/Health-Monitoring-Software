import { encodeCbor, type Cbor } from './cbor'
import type { Transfer } from './transport'

export interface ArchiveRecord extends Transfer {
  subject: string
  mission: string
  day: number
  createdAt: number
  json: string
  jsonBytes: number
  cborBytes: number
  compressedBytes: number
  compression: 'gzip' | 'none'
  digest: string
  iv: Uint8Array<ArrayBuffer>
  encrypted: ArrayBuffer
}
const DB = 'pulsar.telemetry.v1'
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('packets', { keyPath: 'id' })
      r.result.createObjectStore('keys')
    }
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('Close another Pulsar tab to open the archive.'))
    r.onsuccess = () => resolve(r.result)
  })
async function transact<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const r = run(tx.objectStore(store))
      tx.oncomplete = () => resolve(r.result)
      tx.onabort = () => reject(tx.error ?? new Error('Local archive write failed.'))
      tx.onerror = () => reject(tx.error ?? r.error)
    })
  } finally {
    db.close()
  }
}
let keyPromise: Promise<CryptoKey> | null = null
async function archiveKey(): Promise<CryptoKey> {
  return (keyPromise ??= (async () => {
    const saved = (await transact('keys', 'readonly', (s) => s.get('aes'))) as CryptoKey | undefined
    if (saved) return saved
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ])
    // add (not put): another tab cannot silently replace the key used for existing packets.
    try {
      await transact('keys', 'readwrite', (s) => s.add(key, 'aes'))
      return key
    } catch {
      const winner = await transact('keys', 'readonly', (s) => s.get('aes'))
      if (winner) return winner as CryptoKey
      throw new Error('Cannot save the archive encryption key.')
    }
  })().catch((error) => {
    keyPromise = null
    throw error
  }))
}
export const listArchive = () =>
  transact('packets', 'readonly', (s) => s.getAll()) as Promise<ArchiveRecord[]>
export const saveArchive = (record: ArchiveRecord) => transact('packets', 'readwrite', (s) => s.put(record))
const hash = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')

export async function createArchive(
  payload: Cbor,
  meta: Pick<ArchiveRecord, 'subject' | 'mission' | 'day' | 'priority'>,
): Promise<ArchiveRecord> {
  const json = JSON.stringify(payload, null, 2)
  const cbor = encodeCbor(payload)
  const compression = typeof CompressionStream === 'undefined' ? 'none' : 'gzip'
  const compressed =
    compression === 'gzip'
      ? await new Response(new Blob([cbor]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
      : cbor.buffer
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await archiveKey(), compressed)
  const result: ArchiveRecord = {
    ...meta,
    id: crypto.randomUUID(),
    state: 'archived',
    createdAt: Date.now(),
    json,
    jsonBytes: new TextEncoder().encode(JSON.stringify(payload)).length,
    cborBytes: cbor.length,
    compressedBytes: compressed.byteLength,
    compression,
    digest: await hash(cbor),
    iv,
    encrypted,
  }
  await saveArchive(result)
  return result
}

/** Real decryption + integrity check, used by the local receiver demonstration. */
export async function verifyArchive(record: ArchiveRecord): Promise<boolean> {
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv },
    await archiveKey(),
    record.encrypted,
  )
  const plain =
    record.compression === 'gzip'
      ? await new Response(
          new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),
        ).arrayBuffer()
      : bytes
  return (await hash(new Uint8Array(plain))) === record.digest
}

export function wireArchive(record: ArchiveRecord) {
  return encodeCbor({
    schema: 'pulsar.envelope.v1',
    packetId: record.id,
    encryption: 'AES-256-GCM',
    compression: record.compression,
    digest: record.digest,
    iv: record.iv,
    payload: new Uint8Array(record.encrypted),
  })
}

export function downloadArchive(record: ArchiveRecord, readable = false) {
  const blob = readable
    ? new Blob([record.json], { type: 'application/json' })
    : new Blob([wireArchive(record)], { type: 'application/cbor' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pulsar-${record.mission}-day-${record.day}-${record.id.slice(0, 8)}.${readable ? 'json' : 'cbor'}`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
