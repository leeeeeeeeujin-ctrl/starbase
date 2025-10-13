import { useEffect } from 'react'
import { useRouter } from 'next/router'

export default function RoomsRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/match')
  }, [router])
  return null
}

export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/match',
      permanent: false,
    },
  }
}
