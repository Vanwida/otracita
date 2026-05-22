import { redirect } from 'next/navigation'

// /equipo/[slug] → redirige a /equipo/[slug]/agenda (única ruta del MVP).
export default async function TeamIndexPage({
  params,
}: PageProps<'/equipo/[slug]'>) {
  const { slug } = await params
  redirect(`/equipo/${slug.trim().toLowerCase()}/agenda`)
}
