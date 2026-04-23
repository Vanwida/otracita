import { getAppSession } from '@/lib/app-auth/session'

export async function GET() {
  const session = await getAppSession()
  if (!session) return Response.json({ loggedIn: false })
  return Response.json({
    loggedIn: true,
    user: { phone: session.phone, name: session.name, email: session.email },
  })
}
