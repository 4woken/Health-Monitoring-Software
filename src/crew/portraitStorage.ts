import type { AvatarPoint, PersonalAvatar, PortraitView } from '../camera/face/portrait'

const STORE = 'portraits'

interface StoredPortrait {
  profileKey: string
  face: PersonalAvatar
}

function openPortraits(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pulsar.crew.portraits', 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'profileKey' })
    request.onblocked = () => {
      blocked = true
      reject(new Error('Portrait storage is busy in another tab.'))
    }
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
  })
}

async function inPortraitStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openPortraits()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = operation(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? new Error('Portrait storage was interrupted.'))
    })
  } finally {
    database.close()
  }
}

function validMesh(points: AvatarPoint[] | undefined) {
  return (
    Array.isArray(points) &&
    points.length === 468 &&
    points.every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z))
  )
}

function validView(view: PortraitView | undefined) {
  return (
    view &&
    typeof view.imageUrl === 'string' &&
    view.imageUrl.startsWith('data:image/jpeg;base64,') &&
    Number.isSafeInteger(view.width) &&
    view.width > 0 &&
    Number.isSafeInteger(view.height) &&
    view.height > 0 &&
    validMesh(view.points)
  )
}

function validRecord(record: StoredPortrait) {
  const face = record?.face
  return (
    typeof record?.profileKey === 'string' &&
    typeof face?.ownerId === 'string' &&
    validView(face) &&
    (!face.surface || validMesh(face.surface)) &&
    (!face.sideViews || (validView(face.sideViews.left) && validView(face.sideViews.right)))
  )
}

export async function loadPortraits(): Promise<Map<string, PersonalAvatar>> {
  const records: StoredPortrait[] = await inPortraitStore('readonly', (store) => store.getAll())
  return new Map(records.filter(validRecord).map(({ profileKey, face }) => [profileKey, face]))
}

export async function storePortrait(profileKey: string, face: PersonalAvatar | null) {
  if (face) {
    const record: StoredPortrait = { profileKey, face }
    if (!validRecord(record)) throw new Error('The captured face is incomplete.')
    await inPortraitStore('readwrite', (store) => store.put(record))
  } else {
    await inPortraitStore('readwrite', (store) => store.delete(profileKey))
  }
}
