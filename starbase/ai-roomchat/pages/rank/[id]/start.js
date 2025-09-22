// pages/rank/[id]/start.js
import dynamic from 'next/dynamic'
const StartClient = dynamic(()=>import('../../../components/rank/StartClient'), { ssr:false })
export default function Page() { return <StartClient /> }
