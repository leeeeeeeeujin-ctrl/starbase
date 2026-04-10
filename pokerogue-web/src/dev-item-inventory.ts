import { Stat } from "#enums/stat";
import { modifierTypeInitObj, type ModifierType, type ModifierTypeOption, type PokemonModifierType } from "#modifiers/modifier-type";

export type DevItemId =
  | "potion"
  | "hyper_potion"
  | "max_potion"
  | "full_heal"
  | "revive"
  | "max_revive"
  | "ether"
  | "elixir";

export type DevBuffId =
  | "x_attack"
  | "x_defense"
  | "x_speed"
  | "x_sp_atk"
  | "x_sp_def"
  | "x_accuracy"
  | "dire_hit";

export type DevItemCounts = Record<DevItemId, number>;
export type DevBuffCounts = Record<DevBuffId, number>;

export interface DevItemDefinition {
  id: DevItemId;
  createModifierType: () => PokemonModifierType;
  unlockWave: number;
  costMultiplier: number;
}

export interface DevBuffDefinition {
  id: DevBuffId;
  createModifierType: () => ModifierType;
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

export const DEV_BUFF_DEFINITIONS: readonly DevBuffDefinition[] = [
  {
    id: "x_attack",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.ATK),
    unlockWave: 5,
    costMultiplier: 0.12,
  },
  {
    id: "x_defense",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.DEF),
    unlockWave: 5,
    costMultiplier: 0.12,
  },
  {
    id: "x_speed",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.SPD),
    unlockWave: 5,
    costMultiplier: 0.14,
  },
  {
    id: "x_sp_atk",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.SPATK),
    unlockWave: 15,
    costMultiplier: 0.16,
  },
  {
    id: "x_sp_def",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.SPDEF),
    unlockWave: 15,
    costMultiplier: 0.16,
  },
  {
    id: "x_accuracy",
    createModifierType: () => modifierTypeInitObj.TEMP_STAT_STAGE_BOOSTER(Stat.ACC),
    unlockWave: 15,
    costMultiplier: 0.18,
  },
  {
    id: "dire_hit",
    createModifierType: () => modifierTypeInitObj.DIRE_HIT(),
    unlockWave: 25,
    costMultiplier: 0.22,
  },
] as const;

export function createEmptyDevItemCounts(): DevItemCounts {
  return Object.fromEntries(DEV_ITEM_DEFINITIONS.map(def => [def.id, 0])) as DevItemCounts;
}

export function createEmptyDevBuffCounts(): DevBuffCounts {
  return Object.fromEntries(DEV_BUFF_DEFINITIONS.map(def => [def.id, 0])) as DevBuffCounts;
}

export function getDevItemDefinition(itemId: DevItemId): DevItemDefinition {
  return DEV_ITEM_DEFINITIONS.find(def => def.id === itemId)!;
}

export function getDevBuffDefinition(buffId: DevBuffId): DevBuffDefinition {
  return DEV_BUFF_DEFINITIONS.find(def => def.id === buffId)!;
}

export function getDevItemIdFromModifierType(modifierType: ModifierType): DevItemId | undefined {
  return DEV_ITEM_DEFINITIONS.find(def => def.createModifierType().iconImage === modifierType.iconImage)?.id;
}

export function getDevBuffIdFromModifierType(modifierType: ModifierType): DevBuffId | undefined {
  return DEV_BUFF_DEFINITIONS.find(def => def.createModifierType().iconImage === modifierType.iconImage)?.id;
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

export function getDevShopBuffOptions(waveIndex: number, baseCost: number): ModifierTypeOption[] {
  return DEV_BUFF_DEFINITIONS.filter(def => waveIndex >= def.unlockWave).map(def => {
    const type = def.createModifierType();
    return {
      type,
      upgradeCount: 0,
      cost: Math.min(Math.round(baseCost * def.costMultiplier), Number.MAX_SAFE_INTEGER),
    } satisfies ModifierTypeOption;
  });
}
