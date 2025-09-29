import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'

const CasualMatchClient = dynamic(() => import('../../../components/rank/CasualMatchClient'), { ssr: false })

export default function CasualMatchPage() {
  const router = useRouter()
  const { id } = router.query
  if (!id) {
    return <div style={{ padding: 24 }}>게임 정보를 불러오는 중입니다…</div>
  }
  return <CasualMatchClient gameId={Array.isArray(id) ? id[0] : id} />
}
