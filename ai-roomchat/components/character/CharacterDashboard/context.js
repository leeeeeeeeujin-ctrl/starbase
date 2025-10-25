import { createContext, useContext } from 'react';

const CharacterDashboardContext = createContext(null);

export function CharacterDashboardProvider({ value, children }) {
  return (
    <CharacterDashboardContext.Provider value={value}>
      {children}
    </CharacterDashboardContext.Provider>
  );
}

export function useCharacterDashboardContext() {
  const context = useContext(CharacterDashboardContext);
  if (!context) {
    throw new Error('CharacterDashboardContext가 제공되지 않았습니다.');
  }
  return context;
}

export default CharacterDashboardContext;

//
