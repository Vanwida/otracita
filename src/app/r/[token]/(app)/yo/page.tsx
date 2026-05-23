import YoClient from './YoClient'

interface Props {
  params: Promise<{ token: string }>
}

export default async function YoPage({ params }: Props) {
  const { token } = await params
  return <YoClient token={token} />
}
