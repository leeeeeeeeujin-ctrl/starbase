export const MATCH_CONFIRMATION_STORAGE_KEY = 'rank.match.confirmation';

export function saveMatchConfirmation(payload) {
  if (typeof window === 'undefined') return false;
  try {
    const serialized = JSON.stringify(payload);
    window.sessionStorage.setItem(MATCH_CONFIRMATION_STORAGE_KEY, serialized);
    return true;
  } catch (error) {
    console.warn('매칭 확인 정보를 저장하지 못했습니다:', error);
    return false;
  }
}

export function loadMatchConfirmation() {
  if (typeof window === 'undefined') return null;
  try {
    const serialized = window.sessionStorage.getItem(MATCH_CONFIRMATION_STORAGE_KEY);
    if (!serialized) return null;
    return JSON.parse(serialized);
  } catch (error) {
    console.warn('매칭 확인 정보를 불러오지 못했습니다:', error);
    return null;
  }
}

export function clearMatchConfirmation() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MATCH_CONFIRMATION_STORAGE_KEY);
  } catch (error) {
    console.warn('매칭 확인 정보를 삭제하지 못했습니다:', error);
  }
}
