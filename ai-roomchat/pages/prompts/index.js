import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function PromptsIndex() {
  const [prompts, setPrompts] = useState([])

  useEffect(() => {
    // Placeholder: load list from API in future
    setPrompts([
      { id: 'example-1', name: 'Example Prompt 1' },
      { id: 'example-2', name: 'Greeting Prompt' },
    ])
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Prompts</h1>
      <p>Prompt templates. Click a prompt to edit.</p>
      <ul>
        {prompts.map((p) => (
          <li key={p.id}>
            <Link href={`/prompts/${encodeURIComponent(p.id)}/edit`}>
              <a>{p.name} — {p.id}</a>
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href="/prompts/new/edit"><a>Create new prompt</a></Link>
      </p>
    </div>
  )
}
