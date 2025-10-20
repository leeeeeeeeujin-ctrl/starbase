import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function LegacyRoomRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/match')
  }, [router])
  return null
}

export async function getServerSideProps({ params }) {
  return {
    redirect: {
      destination: params?.id ? `/match?fromRoom=${encodeURIComponent(params.id)}` : '/match',
      permanent: false,
    },
  }
}
