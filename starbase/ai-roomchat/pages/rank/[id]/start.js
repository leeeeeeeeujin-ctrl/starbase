// pages/rank/[id]/start.js
import dynamic from 'next/dynamic'

// 이 페이지 전체를 클라이언트에서만 렌더
const StartClient = dynamic(() => import('@/components/rank/StartClient'), { ssr: false })

export default function StartPage() {
  return <StartClient />
}
