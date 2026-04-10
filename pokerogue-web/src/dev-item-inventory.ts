import { modifierTypeInitObj, type ModifierType, type ModifierTypeOption, type PokemonModifierType } from "#modifiers/modifier-type";

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
  unlockWave: number;
  costMultiplier: number;
}

export const DEV_ITEM_DEFINITIONS: readonly DevItemDefinition[] = [
  { id: "potion", createModifierType: () => modifierTypeInitObj.POTION(), unlockWave: 5, costMultiplier: 0.2 },
  { id: "hyper_potion", createModifierType: () => modifierTypeInitObj.HYPER_POTION(), unlockWave: 15, costMultiplier: 0.8 },
  { id: "max_potion", createModifierType: () => modifierTypeInitObj.MAX_POTION(), unlockWave: 25, costMultiplier: 1.5 },
  { id: "full_heal", createModifierType: () => modifierTypeInitObj.FULL_HEAL(), unlockWave: 5, costMultiplier: 1 },
  { id: "revive", createModifierType: () => modifierTypeInitObj.REVIVE(), unlockWave: 15, costMultiplier: 2 },
  { id: "max_revive", createModifierType: () => modifierTypeInitObj.MAX_REVIVE(), unlockWave: 25, costMultiplier: 2.75 },
  { id: "ether", createModifierType: () => modifierTypeInitObj.ETHER(), unlockWave: 5, costMultiplier: 0.4 },
  { id: "elixir", createModifierType: () => modifierTypeInitObj.ELIXIR(), unlockWave: 15, costMultiplier: 1 },
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

export function getDevShopConsumableOptions(waveIndex: number, baseCost: number): ModifierTypeOption[] {
  return DEV_ITEM_DEFINITIONS.filter(def => waveIndex >= def.unlockWave).map(def => {
    const type = def.createModifierType();
    return {
      type,
      upgradeCount: 0,
      cost: Math.min(Math.round(baseCost * def.costMultiplier), Number.MAX_SAFE_INTEGER),
    } satisfies ModifierTypeOption;
  });
}
