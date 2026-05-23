import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBarberPhotoResponse } from './handler.ts'

// -----------------------------------------------------------------------------
// Tests del proxy de fotos del barbero — el core lógico vive en handler.ts
// (route.ts solo inyecta el fetch de DB + fetch nativo).
// -----------------------------------------------------------------------------

const VALID_UUID = '11111111-2222-3333-4444-555555555555'
const BLOB_URL = 'https://uevxeinfoczotdae.public.blob.vercel-storage.com/barber-abc.jpg'

test('200 cuando el barbero existe + tiene photoUrl + upstream responde ok', async () => {
  let fetchedUrl: string | null = null
  const res = await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => BLOB_URL,
    fetchUpstream: async (url) => {
      fetchedUrl = url
      return new Response('IMG_BODY', {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })
    },
  })

  assert.equal(res.status, 200)
  assert.equal(fetchedUrl, BLOB_URL)
  assert.equal(res.headers.get('content-type'), 'image/jpeg')
  assert.equal(
    res.headers.get('cache-control'),
    'public, max-age=31536000, immutable',
  )
  assert.equal(res.headers.get('x-photo-source'), 'vercel-blob-proxy')
  // El body se stream-ea tal cual: leemos para verificar.
  assert.equal(await res.text(), 'IMG_BODY')
})

test('404 cuando el barbero NO tiene photoUrl (o no existe / inactivo)', async () => {
  const res = await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => null,
    fetchUpstream: async () => {
      throw new Error('upstream no debería llamarse cuando no hay photoUrl')
    },
  })

  assert.equal(res.status, 404)
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('404 cuando el id no es UUID válido (defensa barata, sin pegarle a DB)', async () => {
  let dbHit = false
  const res = await resolveBarberPhotoResponse({
    id: 'not-a-uuid',
    fetchPhotoUrl: async () => {
      dbHit = true
      return null
    },
    fetchUpstream: async () => new Response(null),
  })

  assert.equal(res.status, 404)
  assert.equal(dbHit, false, 'no debe tocar la DB con un id inválido')
})

test('502 cuando el fetch upstream tira (timeout / red caída)', async () => {
  const res = await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => BLOB_URL,
    fetchUpstream: async () => {
      throw new Error('ECONNRESET')
    },
  })

  assert.equal(res.status, 502)
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('502 cuando el upstream responde !ok (p.ej. el blob ya no existe → 404 upstream)', async () => {
  const res = await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => BLOB_URL,
    fetchUpstream: async () =>
      new Response('not found', { status: 404 }),
  })

  assert.equal(res.status, 502)
  assert.equal(res.headers.get('cache-control'), 'no-store')
})

test('content-type se respeta (PNG vs JPEG vs WEBP)', async () => {
  const res = await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => BLOB_URL,
    fetchUpstream: async () =>
      new Response('PNG_BODY', {
        status: 200,
        headers: { 'content-type': 'image/png' },
      }),
  })

  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'image/png')
})

test('AbortSignal se inyecta al fetch upstream (para el timeout de 5s)', async () => {
  let signalReceived: AbortSignal | undefined
  await resolveBarberPhotoResponse({
    id: VALID_UUID,
    fetchPhotoUrl: async () => BLOB_URL,
    fetchUpstream: async (_url, init) => {
      signalReceived = init.signal ?? undefined
      return new Response('OK', { status: 200 })
    },
  })

  assert.ok(signalReceived, 'el fetch upstream debe recibir un AbortSignal')
  assert.equal(signalReceived.aborted, false)
})
