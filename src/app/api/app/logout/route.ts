import { destroyAppSession } from '@/lib/app-auth/session'

export async function POST() {
  await destroyAppSession()
  return Response.json({ ok: true })
}
