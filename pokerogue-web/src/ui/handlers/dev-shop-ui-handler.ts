import { globalScene } from "#app/global-scene";
import Overrides from "#app/overrides";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { HealShopCostModifier } from "#modifiers/modifier";
import type { ModifierTypeOption } from "#modifiers/modifier-type";
import { getPlayerShopModifierTypeOptionsForWave } from "#modifiers/modifier-type";
import type { ModifierSelectCallback } from "#phases/select-modifier-phase";
import { AwaitableUiHandler } from "#ui/awaitable-ui-handler";
import {
  DOUBLE_SHOP_ROW_YOFFSET,
  ModifierOption,
  OPTION_BUTTON_YPOSITION,
  SHOP_OPTIONS_ROW_LIMIT,
  SINGLE_SHOP_ROW_YOFFSET,
} from "#ui/modifier-select-ui-handler";
import { addTextObject } from "#ui/text";
import { formatMoney, NumberHolder } from "#utils/common";
import i18next from "i18next";
import Phaser from "phaser";

type DevAction = {
  cursor: number;
  label: string;
  description: string;
  x: number;
  y: number;
};

export class DevShopUiHandler extends AwaitableUiHandler {
  protected declare onActionInput: ModifierSelectCallback | null;

  private modifierContainer: Phaser.GameObjects.Container;
  private descriptionText: Phaser.GameObjects.Text;
  private cursorObj: Phaser.GameObjects.Image | null = null;

  private rowCursor = 1;
  private actionCursor = 0;
  private fixedOptions: ModifierOption[] = [];
  private shopRows: ModifierOption[][] = [];
  private actions: DevAction[] = [];
  private rerollCost = -1;

  constructor() {
    super(UiMode.DEV_SHOP);
  }

  setup(): void {
    const ui = this.getUi();
    this.modifierContainer = globalScene.add.container(0, 0);
    ui.add(this.modifierContainer);

    this.descriptionText = addTextObject(10, -56, "", TextStyle.WINDOW, {
      wordWrap: { width: globalScene.scaledCanvas.width - 20 },
      maxLines: 2,
    });
    this.descriptionText.setVisible(false);
    ui.add(this.descriptionText);
  }

  show(args: any[]): boolean {
    if (this.active) {
      if (args.length >= 3) {
        this.awaitingActionInput = true;
        this.onActionInput = args[2];
      }
      return false;
    }

    if (args.length !== 4 || !Array.isArray(args[1]) || !(args[2] instanceof Function)) {
      return false;
    }

    super.show(args);

    const fixedTypeOptions = args[1] as ModifierTypeOption[];
    this.onActionInput = args[2] as ModifierSelectCallback;
    this.rerollCost = args[3] as number;
    this.awaitingActionInput = true;
    this.rowCursor = fixedTypeOptions.length ? 1 : 2;
    this.actionCursor = 0;
    this.cursor = 0;

    this.clearRenderedState();

    const baseShopCost = new NumberHolder(globalScene.getWaveMoneyAmount(1));
    globalScene.applyModifier(HealShopCostModifier, true, baseShopCost);
    const randomTypeOptions = getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, baseShopCost.value);

    const randomRows = this.chunkOptions(randomTypeOptions, SHOP_OPTIONS_ROW_LIMIT);
    const rewardRowY =
      -globalScene.scaledCanvas.height / 2
      - (randomRows.length > 1 ? SINGLE_SHOP_ROW_YOFFSET : DOUBLE_SHOP_ROW_YOFFSET);

    this.fixedOptions = this.createOptionRow(fixedTypeOptions, rewardRowY, 0.5);
    this.shopRows = randomRows.map((row, index) => {
      const y = -globalScene.scaledCanvas.height / 2
        - globalScene.game.canvas.height / 32
        - (42 - (28 * index - 1));
      return this.createOptionRow(row, y, 0.375);
    });

    this.actions = [
      {
        cursor: 0,
        label: i18next.t("modifierSelectUiHandler:reroll"),
        description: i18next.t("modifierSelectUiHandler:rerollDesc"),
        x: 16,
        y: OPTION_BUTTON_YPOSITION,
      },
      {
        cursor: 1,
        label: i18next.t("modifierSelectUiHandler:checkTeam"),
        description: i18next.t("modifierSelectUiHandler:checkTeamDesc"),
        x: globalScene.scaledCanvas.width - 1,
        y: OPTION_BUTTON_YPOSITION,
      },
      {
        cursor: 2,
        label: i18next.t("modifierSelectUiHandler:leaveShopButton"),
        description: i18next.t("modifierSelectUiHandler:leaveShopDesc"),
        x: 16,
        y: OPTION_BUTTON_YPOSITION - 12,
      },
    ];

    this.renderActions();
    this.descriptionText.setVisible(true);
    this.refreshCursor();
    return true;
  }

  processInput(button: Button): boolean {
    if (!this.awaitingActionInput || !this.onActionInput) {
      return false;
    }

    let success = false;
    switch (button) {
      case Button.UP:
        success = this.moveVertical(-1);
        break;
      case Button.DOWN:
        success = this.moveVertical(1);
        break;
      case Button.LEFT:
        success = this.moveHorizontal(-1);
        break;
      case Button.RIGHT:
        success = this.moveHorizontal(1);
        break;
      case Button.ACTION:
        success = this.onActionInput(this.rowCursor, this.rowCursor === 0 ? this.actionCursor : this.cursor);
        break;
      case Button.CANCEL:
        success = this.onActionInput(0, 2);
        break;
    }

    if (success) {
      this.getUi().playSelect();
    }
    return success;
  }

  clear(): void {
    super.clear();
    this.onActionInput = null;
    this.awaitingActionInput = false;
    this.clearRenderedState();
    this.descriptionText.setVisible(false);
    this.eraseCursor();
  }

  private clearRenderedState() {
    this.modifierContainer.removeAll(true);
    this.fixedOptions = [];
    this.shopRows = [];
    this.actions = [];
  }

  private createOptionRow(typeOptions: ModifierTypeOption[], y: number, scale: number): ModifierOption[] {
    const options: ModifierOption[] = [];
    if (!typeOptions.length) {
      return options;
    }

    const sliceWidth = globalScene.scaledCanvas.width / (typeOptions.length + 2);
    typeOptions.forEach((typeOption, index) => {
      const option = new ModifierOption(sliceWidth * (index + 1) + sliceWidth * 0.5, y, typeOption);
      option.setScale(scale);
      globalScene.add.existing(option);
      this.modifierContainer.add(option);
      void option.show(0, 0, [], false);
      options.push(option);
    });
    return options;
  }

  private renderActions() {
    this.actions.forEach(action => {
      const text = addTextObject(action.x - 4, action.y - 2, action.label, TextStyle.PARTY);
      text.setOrigin(0, 0);
      this.modifierContainer.add(text);
      if (action.cursor === 0 && this.rerollCost >= 0) {
        const costText = addTextObject(
          action.x - 4,
          action.y + 8,
          i18next.t("modifierSelectUiHandler:rerollCost", {
            formattedMoney: formatMoney(globalScene.moneyFormat, this.rerollCost),
          }),
          TextStyle.MONEY,
        );
        costText.setOrigin(0, 0);
        this.modifierContainer.add(costText);
      }
    });
  }

  private moveVertical(direction: -1 | 1): boolean {
    const rows = this.getAvailableRows();
    const currentIndex = rows.indexOf(this.rowCursor);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= rows.length) {
      return false;
    }

    this.rowCursor = rows[nextIndex];
    if (this.rowCursor === 0) {
      this.actionCursor = 0;
    } else {
      const maxCursor = this.getCurrentRowOptions().length - 1;
      this.cursor = Math.min(this.cursor, Math.max(maxCursor, 0));
    }
    this.refreshCursor();
    return true;
  }

  private moveHorizontal(direction: -1 | 1): boolean {
    if (this.rowCursor === 0) {
      const nextCursor = this.actionCursor + direction;
      if (nextCursor < 0 || nextCursor >= this.actions.length) {
        return false;
      }
      this.actionCursor = nextCursor;
      this.refreshCursor();
      return true;
    }

    const nextCursor = this.cursor + direction;
    const rowOptions = this.getCurrentRowOptions();
    if (nextCursor < 0 || nextCursor >= rowOptions.length) {
      return false;
    }
    this.cursor = nextCursor;
    this.refreshCursor();
    return true;
  }

  private refreshCursor() {
    if (!this.cursorObj) {
      this.cursorObj = globalScene.add.image(0, 0, "cursor");
      this.modifierContainer.add(this.cursorObj);
    }

    if (this.rowCursor === 0) {
      const action = this.actions[this.actionCursor];
      if (!action) {
        return;
      }
      this.cursorObj.setScale(1);
      this.cursorObj.setPosition(action.x - 10, action.y + 4);
      this.descriptionText.setText(action.description);
      return;
    }

    const rowOptions = this.getCurrentRowOptions();
    const option = rowOptions[this.cursor];
    if (!option) {
      return;
    }

    this.cursorObj.setScale(this.rowCursor === 1 ? 2 : 1.5);
    this.cursorObj.setPosition(option.x - (this.rowCursor === 1 ? 20 : 16), option.y);
    this.descriptionText.setText(option.modifierTypeOption.type.getDescription());
  }

  private getAvailableRows(): number[] {
    const rows = [0];
    if (this.fixedOptions.length) {
      rows.push(1);
    }
    if (this.shopRows[0]?.length) {
      rows.push(2);
    }
    if (this.shopRows[1]?.length) {
      rows.push(3);
    }
    return rows;
  }

  private getCurrentRowOptions(): ModifierOption[] {
    if (this.rowCursor === 1) {
      return this.fixedOptions;
    }
    if (this.rowCursor >= 2) {
      return this.shopRows[this.rowCursor - 2] ?? [];
    }
    return [];
  }

  private eraseCursor() {
    if (this.cursorObj) {
      this.cursorObj.destroy();
      this.cursorObj = null;
    }
  }
}
