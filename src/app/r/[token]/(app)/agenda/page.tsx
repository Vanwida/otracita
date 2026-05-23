import AgendaClient from './AgendaClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function AgendaPage({ params }: Props) {
  const { token } = await params
  return <AgendaClient token={token} />
}
