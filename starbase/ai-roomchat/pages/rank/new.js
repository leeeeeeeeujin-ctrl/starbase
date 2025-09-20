// pages/rank/new.js
import dynamic from 'next/dynamic'

// 클라이언트에서만 로드 (SSR 끔)
const RankNewClient = dynamic(() => import('../../components/rank/RankNewClient'), {
  ssr: false,
})

export default function Page() {
  return <RankNewClient />
}
