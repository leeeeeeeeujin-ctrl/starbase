import React, { createContext, useContext, useMemo } from "react";

// Provides per-session character variables to game UI/components.
// Default fields per request: image, name, description, ability1..4, ownerId, characterId, score, role

const CharacterCtx = createContext(null);

export function CharacterProvider({ value, children }) {
  const safe = useMemo(() => ({
    image: value?.image || "",
    name: value?.name || "",
    description: value?.description || "",
    ability1: value?.ability1 || "",
    ability2: value?.ability2 || "",
    ability3: value?.ability3 || "",
    ability4: value?.ability4 || "",
    ownerId: value?.ownerId || "",
    characterId: value?.characterId || "",
    score: typeof value?.score === "number" ? value.score : 0,
    role: value?.role || "",
    // Keep room for extension without breaking consumers
    extras: value?.extras || {},
  }), [value]);
  return <CharacterCtx.Provider value={safe}>{children}</CharacterCtx.Provider>;
}

export function useCharacter() {
  const ctx = useContext(CharacterCtx);
  if (!ctx) {
    throw new Error("useCharacter must be used within CharacterProvider");
  }
  return ctx;
}

