import { globalScene } from "#app/global-scene";
import {
  DEV_BUFF_DEFINITIONS,
  DEV_ITEM_DEFINITIONS,
  getDevItemDefinition,
  type DevBuffId,
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

type BagPageKind = "balls" | "items" | "buffs";

type BagPageEntry =
  | { kind: "ball"; label: string; count: number; value: number }
  | { kind: "item"; label: string; count: number; value: DevItemId }
  | { kind: "buff"; label: string; count: number; value: DevBuffId };

type BagPage = {
  kind: BagPageKind;
  label: string;
  entries: BagPageEntry[];
  pageNumber: number;
  pageTotal: number;
};

const MAX_ROWS = 6;

export class BallUiHandler extends UiHandler {
  private pokeballSelectContainer: Phaser.GameObjects.Container;
  private pokeballSelectBg: Phaser.GameObjects.NineSlice;
  private optionsText: Phaser.GameObjects.Text;
  private countsText: Phaser.GameObjects.Text;
  private tabText: Phaser.GameObjects.Text;

  private cursorObj: Phaser.GameObjects.Image | null;
  private pageIndex = 0;
  private cursorByPage: number[] = [0];
  private scale = 0.1666666667;

  constructor() {
    super(UiMode.BALL);
  }

  setup() {
    const ui = this.getUi();

    this.scale = getTextStyleOptions(TextStyle.WINDOW).scale;

    const optionsText = addTextObject(0, 0, this.getLongestPageLabelBlock(), TextStyle.WINDOW, { align: "right", maxLines: 6 });
    const optionsTextWidth = optionsText.displayWidth;
    const panelWidth = 50 + Math.max(64, optionsTextWidth);

    this.pokeballSelectContainer = globalScene.add.container(
      globalScene.scaledCanvas.width - 51 - Math.max(64, optionsTextWidth),
      -49,
    );
    this.pokeballSelectContainer.setVisible(false);
    ui.add(this.pokeballSelectContainer);

    this.pokeballSelectBg = addWindow(0, 0, panelWidth, 32 + 480 * this.scale);
    this.pokeballSelectBg.setOrigin(0, 1);
    this.pokeballSelectContainer.add(this.pokeballSelectBg);

    this.tabText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "center", maxLines: 1 });
    this.tabText.setOrigin(0.5, 0);
    this.tabText.setPositionRelative(this.pokeballSelectBg, panelWidth / 2, 2);
    this.pokeballSelectContainer.add(this.tabText);

    this.optionsText = addTextObject(0, 0, "", TextStyle.WINDOW, { align: "right", maxLines: 6 });
    this.pokeballSelectContainer.add(this.optionsText);
    this.optionsText.setOrigin(0, 0);
    this.optionsText.setPositionRelative(this.pokeballSelectBg, 42, 9);
    this.optionsText.setLineSpacing(this.scale * 72);

    this.countsText = addTextObject(0, 0, "", TextStyle.WINDOW, { maxLines: 6 });
    this.countsText.setPositionRelative(this.pokeballSelectBg, 18, 9);
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
    const page = this.getCurrentPage();
    const entryCount = page.entries.length;

    let success = false;

    if (button === Button.ACTION || button === Button.CANCEL) {
      const commandPhase = globalScene.phaseManager.getCurrentPhase() as CommandPhase;
      success = true;

      if (button === Button.ACTION && this.cursor < entryCount) {
        const entry = page.entries[this.cursor];
        if (!entry) {
          ui.playError();
          return false;
        }

        switch (entry.kind) {
          case "ball":
            if (globalScene.pokeballCounts[entry.value]) {
              if (commandPhase.handleCommand(Command.BALL, entry.value)) {
                globalScene.ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
                globalScene.ui.setMode(UiMode.MESSAGE);
              }
            } else {
              ui.playError();
            }
            break;
          case "item":
            success = this.openDevItem(entry.value);
            break;
          case "buff":
            success = this.openDevBuff(entry.value);
            break;
        }
      } else {
        ui.setMode(UiMode.COMMAND, commandPhase.getFieldIndex());
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
          success = this.shiftPage(-1);
          break;
        case Button.RIGHT:
          success = this.shiftPage(1);
          break;
      }
    }

    if (success) {
      ui.playSelect();
    }

    return success;
  }

  refreshView() {
    const page = this.getCurrentPage();
    const entries = [...page.entries, { label: i18next.t("commandUiHandler:ballCancel"), count: null as number | null }];

    if (this.cursor > entries.length - 1) {
      this.cursor = Math.max(0, entries.length - 1);
      this.cursorByPage[this.pageIndex] = this.cursor;
    }

    this.optionsText.setText(entries.map(entry => entry.label).join("\n"));
    this.countsText.setText(entries.map(entry => (entry.count == null ? "" : `×${entry.count}`)).join("\n"));

    this.tabText.setText(page.pageTotal > 1 ? `${page.label} ${page.pageNumber}/${page.pageTotal}` : page.label);
  }

  setCursor(cursor: number): boolean {
    const ret = super.setCursor(cursor);
    this.cursorByPage[this.pageIndex] = cursor;

    if (!this.cursorObj) {
      this.cursorObj = globalScene.add.image(0, 0, "cursor");
      this.pokeballSelectContainer.add(this.cursorObj);
    }

    this.cursorObj.setScale(this.scale * 6);
    this.cursorObj.setPositionRelative(this.pokeballSelectBg, 12, 15 + (6 + this.cursor * 96) * this.scale);

    return ret;
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

  private isDevMode(): boolean {
    return globalScene.gameMode?.modeId === GameModes.DEV;
  }

  private getPages(): BagPage[] {
    const pages: BagPage[] = [
      {
        kind: "balls",
        label: i18next.t("ballUiHandler:ballsTab"),
        entries: Object.keys(globalScene.pokeballCounts).map((key, index) => ({
          kind: "ball" as const,
          label: getPokeballName(index),
          count: globalScene.pokeballCounts[key],
          value: index,
        })),
        pageNumber: 1,
        pageTotal: 1,
      },
    ];

    if (!this.isDevMode()) {
      return pages;
    }

    const itemPages = this.chunkEntries(
      DEV_ITEM_DEFINITIONS.map(def => ({
        kind: "item" as const,
        label: this.getDevItemLabel(def.id),
        count: globalScene.devItemCounts[def.id],
        value: def.id,
      })),
      i18next.t("ballUiHandler:itemsTab"),
    );

    const buffPages = this.chunkEntries(
      DEV_BUFF_DEFINITIONS.map(def => ({
        kind: "buff" as const,
        label: this.getDevBuffLabel(def.id),
        count: globalScene.devBuffCounts[def.id],
        value: def.id,
      })),
      i18next.t("ballUiHandler:buffsTab"),
    );

    return [...pages, ...itemPages, ...buffPages];
  }

  private chunkEntries<T extends BagPageEntry>(entries: T[], label: string): BagPage[] {
    const chunks: BagPage[] = [];
    const total = Math.max(1, Math.ceil(entries.length / MAX_ROWS));
    for (let start = 0; start < entries.length; start += MAX_ROWS) {
      chunks.push({
        kind: entries[start]?.kind === "buff" ? "buffs" : "items",
        label,
        entries: entries.slice(start, start + MAX_ROWS),
        pageNumber: chunks.length + 1,
        pageTotal: total,
      });
    }
    return chunks;
  }

  private getDevItemLabel(itemId: DevItemId): string {
    const name = getDevItemDefinition(itemId).createModifierType().name;
    return name && !name.startsWith("null.") ? name : itemId;
  }

  private getDevBuffLabel(buffId: DevBuffId): string {
    switch (buffId) {
      case "x_attack":
        return "X어택";
      case "x_defense":
        return "X디펜드";
      case "x_speed":
        return "X스피드";
      case "x_sp_atk":
        return "X특공";
      case "x_sp_def":
        return "X특방";
      case "x_accuracy":
        return "X명중";
      case "dire_hit":
        return "급소공격";
    }
  }

  private getCurrentPage(): BagPage {
    const pages = this.getPages();
    if (this.pageIndex >= pages.length) {
      this.pageIndex = 0;
    }
    if (this.cursorByPage.length !== pages.length) {
      this.cursorByPage = pages.map((_, index) => this.cursorByPage[index] ?? 0);
    }
    return pages[this.pageIndex]!;
  }

  private shiftPage(delta: number): boolean {
    const pages = this.getPages();
    if (pages.length <= 1) {
      return false;
    }
    this.pageIndex = (this.pageIndex + delta + pages.length) % pages.length;
    this.refreshView();
    return this.setCursor(this.cursorByPage[this.pageIndex] ?? 0);
  }

  private getLongestPageLabelBlock(): string {
    const ballLabels = Object.keys(globalScene.pokeballCounts).map((_, index) => getPokeballName(index));
    const devItemLabels = DEV_ITEM_DEFINITIONS.map(def => def.createModifierType().name);
    const devBuffLabels = DEV_BUFF_DEFINITIONS.map(def => def.createModifierType().name);

    const groups = [ballLabels, ...this.chunkLabels(devItemLabels), ...this.chunkLabels(devBuffLabels)];
    return groups
      .map(group => [...group, i18next.t("commandUiHandler:ballCancel")].join("\n"))
      .sort((a, b) => b.length - a.length)[0] ?? i18next.t("commandUiHandler:ballCancel");
  }

  private chunkLabels(labels: string[]): string[][] {
    const chunks: string[][] = [];
    for (let start = 0; start < labels.length; start += MAX_ROWS) {
      chunks.push(labels.slice(start, start + MAX_ROWS));
    }
    return chunks;
  }

  private openDevItem(itemId: DevItemId): boolean {
    if (!globalScene.devItemCounts[itemId]) {
      globalScene.ui.playError();
      return false;
    }

    const modifierType = getDevItemDefinition(itemId).createModifierType();
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

  private openDevBuff(buffId: DevBuffId): boolean {
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
}
