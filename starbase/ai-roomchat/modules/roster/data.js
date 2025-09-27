import { fetchHeroesByOwner } from '../../services/heroes'
import { deriveRosterProfile, fetchProfileById } from '../../services/profiles'

export async function loadRosterBundle({ userId, authProfile, user }) {
  if (!userId) {
    return {
      heroes: [],
      profile: deriveRosterProfile({ profileRow: null, authProfile, user }),
    }
  }

  const [heroes, profileRow] = await Promise.all([
    fetchHeroesByOwner(userId),
    fetchProfileById(userId).catch((error) => {
      console.warn('Failed to load roster profile row', error)
      return null
    }),
  ])

  const profile = deriveRosterProfile({ profileRow, authProfile, user })

  return { heroes, profile }
}
