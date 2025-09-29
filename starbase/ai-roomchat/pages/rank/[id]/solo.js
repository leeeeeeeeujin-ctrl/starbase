import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

const SoloMatchClient = dynamic(() => import('../../../components/rank/SoloMatchClient'), { ssr: false })

export default function SoloMatchPage() {
  const router = useRouter()
  const { id } = router.query
  if (!id) {
    return <div style={{ padding: 24 }}>게임 정보를 불러오는 중입니다…</div>
  }
  return <SoloMatchClient gameId={Array.isArray(id) ? id[0] : id} />
}
