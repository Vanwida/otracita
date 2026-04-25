/**
 * Send a test push notification to a phone. One-shot manual smoke test.
 *
 *   npx tsx --env-file=.env.local scripts/test-push.ts +34644288663
 */
import { sendPushByPhone } from '../src/lib/app-auth/push'

const phone = process.argv[2] || '+34644288663'

async function main() {
  const res = await sendPushByPhone(phone, null, {
    title: 'otracita — prueba',
    body: 'Si lees esto, los push de la PWA funcionan.',
    url: '/',
    tag: 'smoke-test',
    data: { kind: 'smoke_test' },
  })
  console.log(JSON.stringify(res, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
