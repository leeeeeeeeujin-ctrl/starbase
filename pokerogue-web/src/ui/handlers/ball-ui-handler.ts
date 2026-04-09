import { globalScene } from "#app/global-scene";
import { DEV_ITEM_DEFINITIONS, getDevItemDefinition, type DevItemId } from "#app/dev-item-inventory";
import { getPokeballName } from "#data/pokeball";
import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { GameModes } from "#enums/game-modes";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import type { Modifier } from "#modifiers/modifier";
import {
  PokemonMoveModifierType,
  PokemonPpRestoreModifierType,
  PokemonPpUpModifierType,
} from "#modifiers/modifier-type";
import type { CommandPhase } from "#phases/command-phase";
import { PartyOption, PartyUiMode } from "#ui/party-ui-handler";
import { addTextObject, getTextStyleOptions } from "#ui/text";
import { UiHandler } from "#ui/ui-handler";
import { addWindow } from "#ui/ui-theme";
import i18next from "i18next";

enum BagTab {
  BALLS = 0,
  ITEMS = 1,
}

export class BallUiHandler extends UiHandler {
  private pokeballSelectContainer: Phaser.GameObjects.Container;
  private pokeballSelectBg: Phaser.GameObjects.NineSlice;
  private optionsText: Phaser.GameObjects.Text;
  private countsText: Phaser.GameObjects.Text;
  private tabText: Phaser.GameObjects.Text;

  private cursorObj: Phaser.GameObjects.Image | null;
  private activeTab = BagTab.BALLS;
  private tabCursors: Record<BagTab, number> = {
    [BagTab.BALLS]: 0,
    [BagTab.ITEMS]: 0,
  };

  private scale = 0.1666666667;

  constructor() {
    super(UiMode.BALL);
  }

  setup() {
    const ui = this.getUi();

    this.scale = getTextStyleOptions(TextStyle.WINDOW).scale;

    const panelWidth = 152;
    const panelHeight = 32 + 960 * this.scale;
    this.pokeballSelectContainer = globalScene.add.container(
      globalScene.scaledCanvas.width - 51 - panelWidth,
      -49,
    );
    this.pokeballSelectContainer.setVisible(false);
    ui.add(this.pokeballSelectContainer);

    this.pokeballSelectBg = addWindow(0, 0, panelWidth, panelHeight);
    this.pokeballSelectBg.setOrigin(0, 1);
    this.pokeballSelectContainer.add(this.pokeballSelectBg);

    this.tabText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "center", maxLines: 2 });
    this.tabText.setOrigin(0.5, 0);
    this.tabText.setPositionRelative(this.pokeballSelectBg, panelWidth / 2, 8);
    this.pokeballSelectContainer.add(this.tabText);

    this.optionsText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "right", maxLines: 12 });
    this.pokeballSelectContainer.add(this.optionsText);
    this.optionsText.setOrigin(0, 0);
    this.optionsText.setPositionRelative(this.pokeballSelectBg, 42, 30);
    this.optionsText.setLineSpacing(this.scale * 72);

    this.countsText = addTextObject(0, 0, "", TextStyle.WINDOW, {
      maxLines: 12,
    });
    this.countsText.setPositionRelative(this.pokeballSelectBg, 18, 30);
    this.countsText.setLineSpacing(this.scale * 72);
    this.pokeballSelectContainer.add(this.countsText);

    this.setCursor(0);
  }

  show(args: any[]): boolean {
    super.show(args);

    this.refreshView();
    this.pokeballSelectContainer.setVisible(true);
    this.setCursor(this.cursor);

    return true;
  }

  processInput(button: Button): boolean {
    const ui = this.getUi();

    let success = false;

    const entryCount = this.getCurrentOptionCount();

    if (button === Button.ACTION || button === Button.CANCEL) {
      const commandPhase = globalScene.phaseManager.getCurrentPhase() as CommandPhase;
      success = true;
      if (button === Button.ACTION && this.cursor < entryCount) {
        if (this.activeTab === BagTab.BALLS) {
          if (globalScene.pokeballCounts[this.cursor]) {
            if (commandPhase.handleCommand(Command.BALL, this.cursor)) {
              globalScene.ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
              globalScene.ui.setMode(UiMode.MESSAGE);
              success = true;
            }
          } else {
            ui.playError();
          }
        } else {
          success = this.openSelectedDevItem();
        }
      } else {
        ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
        success = true;
      }
    } else {
      switch (button) {
        case Button.UP:
          success = this.setCursor(this.cursor ? this.cursor - 1 : entryCount);
          break;
        case Button.DOWN:
          success = this.setCursor(this.cursor < entryCount ? this.cursor + 1 : 0);
          break;
        case Button.LEFT:
          success = this.setActiveTab(BagTab.BALLS);
          break;
        case Button.RIGHT:
          success = this.setActiveTab(BagTab.ITEMS);
          break;
      }
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  refreshView() {
    const entries = this.getCurrentEntries();
    this.optionsText.setText(`${entries.map(entry => entry.label).join("\n")}\n${i18next.t("commandUiHandler:ballCancel")}`);
    this.countsText.setText(`${entries.map(entry => `×${entry.count}`).join("\n")}\n`);
    this.tabText.setText(
      this.activeTab === BagTab.BALLS
        ? i18next.t("ballUiHandler:ballsTab")
        : i18next.t("ballUiHandler:itemsTab"),
    );
  }

  setCursor(cursor: number): boolean {
    const ret = super.setCursor(cursor);
    this.tabCursors[this.activeTab] = cursor;

    if (!this.cursorObj) {
      this.cursorObj = globalScene.add.image(0, 0, "cursor");
      this.pokeballSelectContainer.add(this.cursorObj);
    }

    this.cursorObj.setScale(this.scale * 6);
    this.cursorObj.setPositionRelative(this.pokeballSelectBg, 12, 36 + (6 + this.cursor * 96) * this.scale);

    return ret;
  }

  private setActiveTab(tab: BagTab): boolean {
    if (tab === this.activeTab || (tab === BagTab.ITEMS && !this.hasItemTab())) {
      return false;
    }
    this.activeTab = tab;
    this.refreshView();
    return this.setCursor(this.tabCursors[tab] ?? 0);
  }

  private hasItemTab(): boolean {
    return globalScene.gameMode?.modeId === GameModes.DEV;
  }

  private getCurrentEntries(): { label: string; count: number }[] {
    if (this.activeTab === BagTab.ITEMS && this.hasItemTab()) {
      return DEV_ITEM_DEFINITIONS.map(def => {
        const modifierType = def.createModifierType();
        return {
          label: modifierType.name,
          count: globalScene.devItemCounts[def.id],
        };
      });
    }

    return Object.keys(globalScene.pokeballCounts).map((key, index) => ({
      label: getPokeballName(index),
      count: globalScene.pokeballCounts[key],
    }));
  }

  private getCurrentOptionCount(): number {
    return this.getCurrentEntries().length;
  }

  private openSelectedDevItem(): boolean {
    const itemId = DEV_ITEM_DEFINITIONS[this.cursor]?.id;
    if (!itemId) {
      return false;
    }
    if (!globalScene.devItemCounts[itemId]) {
      globalScene.ui.playError();
      return false;
    }

    const modifierType = getDevItemDefinition(itemId).createModifierType();
    const party = globalScene.getPlayerParty();
    const resetBagMode = () => {
      this.refreshView();
      globalScene.ui.setMode(UiMode.BALL);
    };
    const consumeModifier = (modifier: Modifier | null) => {
      const success = globalScene.addModifier(modifier, false, true);
      if (success) {
        globalScene.devItemCounts[itemId] = Math.max(0, globalScene.devItemCounts[itemId] - 1);
      } else {
        globalScene.ui.playError();
      }
      resetBagMode();
    };

    if (modifierType instanceof PokemonMoveModifierType) {
      globalScene.ui.setModeWithoutClear(
        UiMode.PARTY,
        PartyUiMode.MOVE_MODIFIER,
        -1,
        (slotIndex: number, option: PartyOption) => {
          if (slotIndex < 6) {
            consumeModifier(modifierType.newModifier(party[slotIndex], option - PartyOption.MOVE_1));
          } else {
            resetBagMode();
          }
        },
        modifierType.selectFilter,
        modifierType.moveSelectFilter,
        undefined,
        modifierType instanceof PokemonPpRestoreModifierType || modifierType instanceof PokemonPpUpModifierType,
      );
      return true;
    }

    globalScene.ui.setModeWithoutClear(
      UiMode.PARTY,
      PartyUiMode.MODIFIER,
      -1,
      (slotIndex: number) => {
        if (slotIndex < 6) {
          consumeModifier(modifierType.newModifier(party[slotIndex]));
        } else {
          resetBagMode();
        }
      },
      modifierType.selectFilter,
    );
    return true;
  }

  clear() {
    super.clear();
    this.pokeballSelectContainer.setVisible(false);
    this.eraseCursor();
  }

  eraseCursor() {
    if (this.cursorObj) {
      this.cursorObj.destroy();
    }
    this.cursorObj = null;
  }
}
