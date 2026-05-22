import { redirect } from 'next/navigation'

interface PageProps {
  params: Promise<{ slug: string }>
}

// /equipo/[slug] → redirige a /equipo/[slug]/agenda (única ruta del MVP).
export default async function TeamIndexPage({ params }: PageProps) {
  const { slug } = await params
  redirect(`/equipo/${slug.trim().toLowerCase()}/agenda`)
}
