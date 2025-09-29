import dynamic from 'next/dynamic'

const SoloMatchClient = dynamic(() => import('../../../components/rank/SoloMatchClient'), {
  ssr: false,
})

export default function SoloMatchPage() {
  return <SoloMatchClient />
}

