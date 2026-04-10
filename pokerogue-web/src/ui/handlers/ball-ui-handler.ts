import { globalScene } from "#app/global-scene";
import {
  DEV_BUFF_DEFINITIONS,
  DEV_ITEM_DEFINITIONS,
  getDevItemDefinition,
  type DevItemId,
} from "#app/dev-item-inventory";
import { getPokeballName } from "#data/pokeball";
import { Button } from "#enums/buttons";
import { Command } from "#enums/command";
import { GameModes } from "#enums/game-modes";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
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
  BUFFS = 2,
}

export class BallUiHandler extends UiHandler {
  private static readonly MAX_ROWS_PER_COLUMN = 6;
  private static readonly COLUMN_X_OFFSETS = [18, 132];

  private pokeballSelectContainer: Phaser.GameObjects.Container;
  private pokeballSelectBg: Phaser.GameObjects.NineSlice;
  private leftOptionsText: Phaser.GameObjects.Text;
  private leftCountsText: Phaser.GameObjects.Text;
  private rightOptionsText: Phaser.GameObjects.Text;
  private rightCountsText: Phaser.GameObjects.Text;
  private tabText: Phaser.GameObjects.Text;

  private cursorObj: Phaser.GameObjects.Image | null;
  private activeTab = BagTab.BALLS;
  private tabCursors: Record<BagTab, number> = {
    [BagTab.BALLS]: 0,
    [BagTab.ITEMS]: 0,
    [BagTab.BUFFS]: 0,
  };

  private scale = 0.1666666667;

  constructor() {
    super(UiMode.BALL);
  }

  setup() {
    const ui = this.getUi();

    this.scale = getTextStyleOptions(TextStyle.WINDOW).scale;

    const panelWidth = 266;
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

    this.leftOptionsText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "right", maxLines: 6 });
    this.pokeballSelectContainer.add(this.leftOptionsText);
    this.leftOptionsText.setOrigin(0, 0);
    this.leftOptionsText.setPositionRelative(this.pokeballSelectBg, 42, 30);
    this.leftOptionsText.setLineSpacing(this.scale * 72);

    this.leftCountsText = addTextObject(0, 0, "", TextStyle.WINDOW, { maxLines: 6 });
    this.leftCountsText.setPositionRelative(this.pokeballSelectBg, 18, 30);
    this.leftCountsText.setLineSpacing(this.scale * 72);
    this.pokeballSelectContainer.add(this.leftCountsText);

    this.rightOptionsText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "right", maxLines: 6 });
    this.pokeballSelectContainer.add(this.rightOptionsText);
    this.rightOptionsText.setOrigin(0, 0);
    this.rightOptionsText.setPositionRelative(this.pokeballSelectBg, 156, 30);
    this.rightOptionsText.setLineSpacing(this.scale * 72);

    this.rightCountsText = addTextObject(0, 0, "", TextStyle.WINDOW, { maxLines: 6 });
    this.rightCountsText.setPositionRelative(this.pokeballSelectBg, 132, 30);
    this.rightCountsText.setLineSpacing(this.scale * 72);
    this.pokeballSelectContainer.add(this.rightCountsText);

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
        } else if (this.activeTab === BagTab.ITEMS) {
          success = this.openSelectedDevItem();
        } else {
          success = this.openSelectedDevBuff();
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
          success = this.shiftActiveTab(-1);
          break;
        case Button.RIGHT:
          success = this.shiftActiveTab(1);
          break;
      }
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  refreshView() {
    const entries = [...this.getCurrentEntries(), { label: i18next.t("commandUiHandler:ballCancel"), count: null as number | null }];
    const leftEntries = entries.slice(0, BallUiHandler.MAX_ROWS_PER_COLUMN);
    const rightEntries = entries.slice(BallUiHandler.MAX_ROWS_PER_COLUMN, BallUiHandler.MAX_ROWS_PER_COLUMN * 2);

    this.leftOptionsText.setText(leftEntries.map(entry => entry.label).join("\n"));
    this.leftCountsText.setText(leftEntries.map(entry => (entry.count == null ? "" : `×${entry.count}`)).join("\n"));
    this.rightOptionsText.setText(rightEntries.map(entry => entry.label).join("\n"));
    this.rightCountsText.setText(rightEntries.map(entry => (entry.count == null ? "" : `×${entry.count}`)).join("\n"));
    this.tabText.setText(
      this.activeTab === BagTab.BALLS
        ? i18next.t("ballUiHandler:ballsTab")
        : this.activeTab === BagTab.ITEMS
          ? i18next.t("ballUiHandler:itemsTab")
          : i18next.t("ballUiHandler:buffsTab"),
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
    const column = Math.floor(this.cursor / BallUiHandler.MAX_ROWS_PER_COLUMN);
    const row = this.cursor % BallUiHandler.MAX_ROWS_PER_COLUMN;
    const xOffset = BallUiHandler.COLUMN_X_OFFSETS[Math.min(column, BallUiHandler.COLUMN_X_OFFSETS.length - 1)];
    this.cursorObj.setPositionRelative(this.pokeballSelectBg, xOffset, 36 + (6 + row * 96) * this.scale);

    return ret;
  }

  private setActiveTab(tab: BagTab): boolean {
    if (tab === this.activeTab || !this.getAvailableTabs().includes(tab)) {
      return false;
    }
    this.activeTab = tab;
    this.refreshView();
    return this.setCursor(this.tabCursors[tab] ?? 0);
  }

  private shiftActiveTab(delta: number): boolean {
    const tabs = this.getAvailableTabs();
    const currentIndex = tabs.indexOf(this.activeTab);
    const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
    return this.setActiveTab(tabs[nextIndex]!);
  }

  private hasItemTab(): boolean {
    return globalScene.gameMode?.modeId === GameModes.DEV;
  }

  private getAvailableTabs(): BagTab[] {
    if (!this.hasItemTab()) {
      return [BagTab.BALLS];
    }
    return [BagTab.BALLS, BagTab.ITEMS, BagTab.BUFFS];
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

    if (this.activeTab === BagTab.BUFFS && this.hasItemTab()) {
      return DEV_BUFF_DEFINITIONS.map(def => {
        const modifierType = def.createModifierType();
        return {
          label: modifierType.name,
          count: globalScene.devBuffCounts[def.id],
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
    const queueUsage = (slotIndex: number, moveIndex?: number) => {
      const commandPhase = globalScene.phaseManager.getCurrentPhase() as CommandPhase;
      const success = commandPhase.handleDevItemCommand(itemId, slotIndex, moveIndex);
      if (success) {
        globalScene.ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
        globalScene.ui.setMode(UiMode.MESSAGE);
      } else {
        globalScene.ui.playError();
        resetBagMode();
      }
    };

    if (modifierType instanceof PokemonMoveModifierType) {
      globalScene.ui.setModeWithoutClear(
        UiMode.PARTY,
        PartyUiMode.MOVE_MODIFIER,
        -1,
        (slotIndex: number, option: PartyOption) => {
          if (slotIndex < 6) {
            queueUsage(slotIndex, option - PartyOption.MOVE_1);
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
          queueUsage(slotIndex);
        } else {
          resetBagMode();
        }
      },
      modifierType.selectFilter,
    );
    return true;
  }

  private openSelectedDevBuff(): boolean {
    const buffId = DEV_BUFF_DEFINITIONS[this.cursor]?.id;
    if (!buffId) {
      return false;
    }
    if (!globalScene.devBuffCounts[buffId]) {
      globalScene.ui.playError();
      return false;
    }

    const commandPhase = globalScene.phaseManager.getCurrentPhase() as CommandPhase;
    const success = commandPhase.handleDevBuffCommand(buffId);
    if (success) {
      globalScene.ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
      globalScene.ui.setMode(UiMode.MESSAGE);
      return true;
    }

    globalScene.ui.playError();
    return false;
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
