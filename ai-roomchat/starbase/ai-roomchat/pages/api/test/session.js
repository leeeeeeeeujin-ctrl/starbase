import { supabaseAdmin } from '@/lib/supabaseAdmin'

export default async function handler(req, res) {
  // Guard: only enable when explicitly allowed via env
  if (process.env.ENABLE_TEST_ENDPOINT !== 'true') {
    return res.status(404).json({ error: 'Not found' })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end()
  }

  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' })
  }

  try {
    // Try signing in. Using the service role key allows server-side sign in.
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // If user not found, try to create a test user (email confirmation bypassed)
      // This uses the admin API which requires service role key.
      if (error.status === 400 || /invalid login/.test(error.message || '')) {
        const { data: createData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        })
        if (createErr) return res.status(500).json({ error: createErr.message })

        // Attempt sign in again
        const { data: secondData, error: secondErr } = await supabaseAdmin.auth.signInWithPassword({
          email,
          password,
        })
        if (secondErr) return res.status(500).json({ error: secondErr.message })
        return res.status(200).json({ access_token: secondData.session?.access_token, refresh_token: secondData.session?.refresh_token })
      }

      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ access_token: data.session?.access_token, refresh_token: data.session?.refresh_token })
  } catch (err) {
    return res.status(500).json({ error: String(err) })
  }
}
