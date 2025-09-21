// pages/rank/[id]/start.js
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'

const StartClient = dynamic(() => import('@/components/rank/StartClient'), { ssr: false })

export default function RankStartPage() {
  const router = useRouter()
  const { id } = router.query
  const [mounted, setMounted] = useState(false)
  useEffect(()=>{ setMounted(true) },[])
  if (!mounted || !id) return null

  return <StartClient gameId={id} onExit={() => router.replace(`/rank/${id}`)} />
}
