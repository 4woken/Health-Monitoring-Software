/** RFC 8949 definite-length CBOR for the JSON-like telemetry schema, plus byte strings. */
export type Cbor = null | boolean | number | string | Uint8Array | Cbor[] | { [key: string]: Cbor }

export function encodeCbor(value: Cbor): Uint8Array<ArrayBuffer> {
  const bytes: number[] = []
  const push = (data: Uint8Array) => {
    for (const byte of data) bytes.push(byte)
  }
  const head = (major: number, n: number) => {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error('Invalid CBOR length or integer')
    if (n < 24) bytes.push(major * 32 + n)
    else {
      const width = n <= 255 ? 1 : n <= 65535 ? 2 : n <= 0xffffffff ? 4 : 8
      bytes.push(major * 32 + ({ 1: 24, 2: 25, 4: 26, 8: 27 } as const)[width])
      const buf = new Uint8Array(width)
      let remaining = BigInt(n)
      for (let i = width - 1; i >= 0; i--) {
        buf[i] = Number(remaining & 255n)
        remaining >>= 8n
      }
      push(buf)
    }
  }
  const write = (v: Cbor) => {
    if (v === null) bytes.push(0xf6)
    else if (typeof v === 'boolean') bytes.push(v ? 0xf5 : 0xf4)
    else if (typeof v === 'number') {
      if (!Number.isFinite(v)) throw new Error('Telemetry numbers must be finite')
      if (Number.isSafeInteger(v)) head(v >= 0 ? 0 : 1, v >= 0 ? v : -1 - v)
      else {
        bytes.push(0xfb)
        const buf = new ArrayBuffer(8)
        new DataView(buf).setFloat64(0, v)
        push(new Uint8Array(buf))
      }
    } else if (typeof v === 'string') {
      const buf = new TextEncoder().encode(v)
      head(3, buf.length)
      push(buf)
    } else if (v instanceof Uint8Array) {
      head(2, v.length)
      push(v)
    } else if (Array.isArray(v)) {
      head(4, v.length)
      for (const item of v) write(item)
    } else if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
      const entries = Object.entries(v)
      head(5, entries.length)
      for (const [key, item] of entries) {
        write(key)
        write(item)
      }
    } else throw new Error('Unsupported telemetry value')
  }
  write(value)
  return new Uint8Array(bytes)
}
