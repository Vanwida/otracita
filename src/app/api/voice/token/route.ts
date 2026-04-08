import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth/server';

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'XAI_API_KEY not configured' }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expires_after: { seconds: 3600 } }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error('Grok client secret error:', res.status, text);
      return NextResponse.json(
        { error: 'Failed to generate client secret' },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ token: data.value, expires_at: data.expires_at });
  } catch (err) {
    console.error('Voice token error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
