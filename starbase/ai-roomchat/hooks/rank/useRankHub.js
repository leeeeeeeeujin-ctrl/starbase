import { useRankHubActions } from './useRankHubActions'
import { useRankHubBootstrap } from './useRankHubBootstrap'
import { useRankHubForms } from './useRankHubForms'

export function useRankHub() {
  const bootstrap = useRankHubBootstrap()
  const forms = useRankHubForms({ games: bootstrap.games })
  const actions = useRankHubActions({
    user: bootstrap.user,
    refreshLists: bootstrap.refreshLists,
    createForm: forms.createForm,
    joinForm: forms.joinForm,
    playForm: forms.playForm,
  })

  return {
    initialized: bootstrap.initialized,
    user: bootstrap.user,
    games: bootstrap.games,
    participants: bootstrap.participants,
    refreshLists: bootstrap.refreshLists,
    forms,
    actions,
  }
}
