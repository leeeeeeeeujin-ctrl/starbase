import { applyAbAttrs } from "#abilities/apply-ab-attrs";
import type { TurnCommand } from "#app/battle";
import { getDevBuffDefinition, getDevItemDefinition, type DevBuffId, type DevItemId } from "#app/dev-item-inventory";
import { globalScene } from "#app/global-scene";
import { getPokemonNameWithAffix } from "#app/messages";
import { ArenaTagSide } from "#enums/arena-tag-side";
import type { BattlerIndex } from "#enums/battler-index";
import { Command } from "#enums/command";
import { SwitchType } from "#enums/switch-type";
import type { Pokemon } from "#field/pokemon";
import { BypassSpeedChanceModifier } from "#modifiers/modifier";
import { PokemonMove } from "#moves/pokemon-move";
import { FieldPhase } from "#phases/field-phase";
import { inSpeedOrder } from "#utils/speed-order-generator";

export class TurnStartPhase extends FieldPhase {
  public readonly phaseName = "TurnStartPhase";

  private getDevBuffMessage(pokemon: Pokemon, buffId: DevBuffId): string {
    const pokemonName = getPokemonNameWithAffix(pokemon);
    switch (buffId) {
      case "x_attack":
        return `${pokemonName}의 공격이 올랐다!`;
      case "x_defense":
        return `${pokemonName}의 방어가 올랐다!`;
      case "x_speed":
        return `${pokemonName}의 스피드가 올랐다!`;
      case "x_sp_atk":
        return `${pokemonName}의 특수공격이 올랐다!`;
      case "x_sp_def":
        return `${pokemonName}의 특수방어가 올랐다!`;
      case "x_accuracy":
        return `${pokemonName}의 명중률이 올랐다!`;
      case "dire_hit":
        return `${pokemonName}의 급소율이 올라갔다!`;
    }
  }

  private getDevItemPostMessage(targetPokemon: Pokemon, itemId: DevItemId): string | null {
    const pokemonName = getPokemonNameWithAffix(targetPokemon);
    switch (itemId) {
      case "ether":
        return `${pokemonName}의 PP가 회복되었다!`;
      case "elixir":
        return `${pokemonName}의 모든 PP가 회복되었다!`;
      default:
        return null;
    }
  }

  /**
   * Returns an ordering of the current field based on command priority
   * @returns The sequence of commands for this turn
   */
  private getCommandOrder(): BattlerIndex[] {
    const playerField = globalScene.getPlayerField(true).map(p => p.getBattlerIndex());
    const enemyField = globalScene.getEnemyField(true).map(p => p.getBattlerIndex());
    const orderedTargets: BattlerIndex[] = playerField.concat(enemyField);

    // The function begins sorting orderedTargets based on command priority, move priority, and possible speed bypasses.
    // Non-FIGHT commands (SWITCH, BALL, RUN) have a higher command priority and will always occur before any FIGHT commands.
    orderedTargets.sort((a, b) => {
      const aCommand = globalScene.currentBattle.turnCommands[a];
      const bCommand = globalScene.currentBattle.turnCommands[b];

      if (aCommand?.command !== bCommand?.command) {
        if (aCommand?.command === Command.FIGHT) {
          return 1;
        }
        if (bCommand?.command === Command.FIGHT) {
          return -1;
        }
      }

      const aIndex = orderedTargets.indexOf(a);
      const bIndex = orderedTargets.indexOf(b);

      return aIndex < bIndex ? -1 : aIndex > bIndex ? 1 : 0;
    });
    return orderedTargets;
  }

  // TODO: Refactor this alongside `CommandPhase.handleCommand` to use SEPARATE METHODS
  // Also need a clearer distinction between "turn command" and queued moves
  start() {
    super.start();

    const field = globalScene.getField();
    const moveOrder = this.getCommandOrder();

    for (const pokemon of inSpeedOrder(ArenaTagSide.BOTH)) {
      const preTurnCommand = globalScene.currentBattle.preTurnCommands[pokemon.getBattlerIndex()];

      if (preTurnCommand?.skip) {
        continue;
      }

      switch (preTurnCommand?.command) {
        case Command.TERA:
          globalScene.phaseManager.pushNew("TeraPhase", pokemon);
      }
    }

    const phaseManager = globalScene.phaseManager;
    for (const pokemon of inSpeedOrder(ArenaTagSide.BOTH)) {
      if (globalScene.currentBattle.turnCommands[pokemon.getBattlerIndex()]?.command !== Command.FIGHT) {
        continue;
      }

      applyAbAttrs("BypassSpeedChanceAbAttr", { pokemon });
      globalScene.applyModifiers(BypassSpeedChanceModifier, pokemon.isPlayer(), pokemon);
    }

    moveOrder.forEach((o, index) => {
      const pokemon = field[o];
      const turnCommand = globalScene.currentBattle.turnCommands[o];

      if (!turnCommand || turnCommand.skip) {
        return;
      }

      // TODO: Remove `turnData.order` -
      // it is used exclusively for Fusion Flare/Bolt
      // and uses a really jank (and incorrect) implementation
      if (turnCommand.command === Command.FIGHT) {
        pokemon.turnData.order = index;
      }
      this.handleTurnCommand(turnCommand, pokemon);
    });

    // Queue various effects for the end of the turn.
    phaseManager.pushNew("CheckInterludePhase");

    // TODO: Re-order these phases to be consistent with mainline turn order:
    // https://www.smogon.com/forums/threads/sword-shield-battle-mechanics-research.3655528/page-64#post-9244179

    // TODO: In an ideal world, this is handled by the phase manager. The change is nontrivial due to the ordering of post-turn phases like those queued by VictoryPhase
    globalScene.phaseManager.queueTurnEndPhases();

    /*
     * `this.end()` will call `PhaseManager#shiftPhase()`, which dumps everything from `phaseQueuePrepend`
     * (aka everything that is queued via `unshift()`) to the front of the queue and dequeues to start the next phase.
     * This is important since stuff like `SwitchSummonPhase`, `AttemptRunPhase`, and `AttemptCapturePhase` break the "flow" and should take precedence
     */
    this.end();
  }

  private handleTurnCommand(turnCommand: TurnCommand, pokemon: Pokemon) {
    switch (turnCommand?.command) {
      case Command.FIGHT:
        this.handleFightCommand(turnCommand, pokemon);
        break;
      case Command.BALL:
        globalScene.phaseManager.unshiftNew("AttemptCapturePhase", turnCommand.targets![0] % 2, turnCommand.cursor!); //TODO: is the bang correct here?
        break;
      case Command.ITEM:
        this.handleItemCommand(turnCommand, pokemon);
        break;
      case Command.POKEMON:
        globalScene.phaseManager.unshiftNew(
          "SwitchSummonPhase",
          turnCommand.args?.[0] ? SwitchType.BATON_PASS : SwitchType.SWITCH,
          pokemon.getFieldIndex(),
          turnCommand.cursor!, // TODO: Is this bang correct?
          true,
          pokemon.isPlayer(),
        );
        break;
      case Command.RUN:
        globalScene.phaseManager.unshiftNew("AttemptRunPhase");
        break;
    }
  }

  private handleFightCommand(turnCommand: TurnCommand, pokemon: Pokemon) {
    const queuedMove = turnCommand.move;
    if (!queuedMove) {
      return;
    }

    // TODO: This seems somewhat dubious
    const move =
      pokemon.getMoveset().find(m => m.moveId === queuedMove.move && m.ppUsed < m.getMovePp())
      ?? new PokemonMove(queuedMove.move);

    if (move.getMove().hasAttr("MoveHeaderAttr")) {
      globalScene.phaseManager.unshiftNew("MoveHeaderPhase", pokemon, move);
    }

    globalScene.phaseManager.pushNew(
      "MovePhase",
      pokemon,
      turnCommand.targets ?? queuedMove.targets,
      move,
      queuedMove.useMode,
    );
  }

  private handleItemCommand(turnCommand: TurnCommand, pokemon: Pokemon) {
    const itemKind = turnCommand.args?.[0] as string | undefined;
    const isBuffItem = itemKind === "dev-buff";

    let modifier;
    if (isBuffItem) {
      const buffId = turnCommand.args?.[1] as DevBuffId | undefined;
      if (!buffId || !globalScene.devBuffCounts[buffId]) {
        return;
      }
      const modifierType = getDevBuffDefinition(buffId).createModifierType();
      modifier = modifierType.newModifier(pokemon);
      if (!modifier) {
        return;
      }
      const applied = globalScene.addModifier(modifier, false, true);
      if (!applied) {
        return;
      }
      globalScene.devBuffCounts[buffId] = Math.max(0, globalScene.devBuffCounts[buffId] - 1);
      globalScene.phaseManager.queueMessage(this.getDevBuffMessage(pokemon, buffId));
      return;
    }

    const itemId = itemKind as DevItemId | undefined;
    const moveIndex = turnCommand.args?.[1] as number | undefined;
    const targetPartyIndex = turnCommand.cursor;
    if (!itemId || targetPartyIndex === undefined || !globalScene.devItemCounts[itemId]) {
      return;
    }

    const targetPokemon = globalScene.getPlayerParty()[targetPartyIndex];
    if (!targetPokemon) {
      return;
    }

    const modifierType = getDevItemDefinition(itemId).createModifierType();
    modifier = modifierType.newModifier(targetPokemon, typeof moveIndex === "number" ? moveIndex : undefined);

    if (!modifier) {
      return;
    }

    const applied = globalScene.addModifier(modifier, false, true);
    if (!applied) {
      return;
    }

    globalScene.devItemCounts[itemId] = Math.max(0, globalScene.devItemCounts[itemId] - 1);
    const postMessage = this.getDevItemPostMessage(targetPokemon, itemId);
    if (postMessage) {
      globalScene.phaseManager.queueMessage(postMessage);
    }
  }
}
