import { modifierTypeInitObj, type ModifierType, type PokemonModifierType } from "#modifiers/modifier-type";

export type DevItemId =
  | "potion"
  | "super_potion"
  | "hyper_potion"
  | "max_potion"
  | "full_heal"
  | "revive"
  | "max_revive"
  | "ether"
  | "elixir"
  | "max_elixir";

export type DevItemCounts = Record<DevItemId, number>;

export interface DevItemDefinition {
  id: DevItemId;
  createModifierType: () => PokemonModifierType;
}

export const DEV_ITEM_DEFINITIONS: readonly DevItemDefinition[] = [
  { id: "potion", createModifierType: () => modifierTypeInitObj.POTION() },
  { id: "super_potion", createModifierType: () => modifierTypeInitObj.SUPER_POTION() },
  { id: "hyper_potion", createModifierType: () => modifierTypeInitObj.HYPER_POTION() },
  { id: "max_potion", createModifierType: () => modifierTypeInitObj.MAX_POTION() },
  { id: "full_heal", createModifierType: () => modifierTypeInitObj.FULL_HEAL() },
  { id: "revive", createModifierType: () => modifierTypeInitObj.REVIVE() },
  { id: "max_revive", createModifierType: () => modifierTypeInitObj.MAX_REVIVE() },
  { id: "ether", createModifierType: () => modifierTypeInitObj.ETHER() },
  { id: "elixir", createModifierType: () => modifierTypeInitObj.ELIXIR() },
  { id: "max_elixir", createModifierType: () => modifierTypeInitObj.MAX_ELIXIR() },
] as const;

const DEV_ITEM_IDS_BY_ICON = Object.fromEntries(
  DEV_ITEM_DEFINITIONS.map(def => [def.createModifierType().iconImage, def.id]),
) as Record<string, DevItemId>;

export function createEmptyDevItemCounts(): DevItemCounts {
  return Object.fromEntries(DEV_ITEM_DEFINITIONS.map(def => [def.id, 0])) as DevItemCounts;
}

export function getDevItemDefinition(itemId: DevItemId): DevItemDefinition {
  return DEV_ITEM_DEFINITIONS.find(def => def.id === itemId)!;
}

export function getDevItemIdFromModifierType(modifierType: ModifierType): DevItemId | undefined {
  return DEV_ITEM_IDS_BY_ICON[modifierType.iconImage];
}
