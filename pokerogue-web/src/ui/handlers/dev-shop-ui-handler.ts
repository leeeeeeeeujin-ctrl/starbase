import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { HealShopCostModifier } from "#modifiers/modifier";
import type { ModifierTypeOption } from "#modifiers/modifier-type";
import { getPlayerShopModifierTypeOptionsForWave } from "#modifiers/modifier-type";
import type { ModifierSelectCallback } from "#phases/select-modifier-phase";
import { AwaitableUiHandler } from "#ui/awaitable-ui-handler";
import { addTextObject, getTextColor } from "#ui/text";
import { addWindow } from "#ui/ui-theme";
import { formatMoney, NumberHolder } from "#utils/common";
import i18next from "i18next";
import Phaser from "phaser";

type DevAction = {
  callbackCursor: number;
  label: string;
  description: string;
  priceText?: string;
};

type DevRow = {
  rowCursor: number;
  options: ModifierTypeOption[];
};

const PANEL_X = 72;
const PANEL_Y = 92;
const PANEL_WIDTH = 760;
const PANEL_HEIGHT = 360;
const INNER_X = PANEL_X + 24;
const INNER_WIDTH = PANEL_WIDTH - 48;
const SECTION_WIDTH = INNER_WIDTH;
const FIXED_HEADER_Y = PANEL_Y + 106;
const FIXED_ROWS_Y = FIXED_HEADER_Y + 28;
const RANDOM_HEADER_Y = FIXED_ROWS_Y + 82;
const RANDOM_ROWS_Y = RANDOM_HEADER_Y + 28;
const ROW_HEIGHT = 34;
const ACTION_BAR_Y = PANEL_Y + PANEL_HEIGHT - 44;
const DESCRIPTION_Y = PANEL_Y + PANEL_HEIGHT + 10;

export class DevShopUiHandler extends AwaitableUiHandler {
  protected declare onActionInput: ModifierSelectCallback | null;

  private rootContainer: Phaser.GameObjects.Container;
  private listContainer: Phaser.GameObjects.Container;
  private actionContainer: Phaser.GameObjects.Container;
  private descriptionText: Phaser.GameObjects.Text;
  private cursorObj: Phaser.GameObjects.Image | null = null;

  private rows: DevRow[] = [];
  private actions: DevAction[] = [];
  private rowCursor = 1;
  private cursor = 0;
  private actionCursor = 0;
  private rerollCost = -1;

  constructor() {
    super(UiMode.DEV_SHOP);
  }

  setup(): void {
    const ui = this.getUi();
    this.rootContainer = globalScene.add.container(0, 0);
    this.listContainer = globalScene.add.container(0, 0);
    this.actionContainer = globalScene.add.container(0, 0);
    this.rootContainer.add(this.listContainer);
    this.rootContainer.add(this.actionContainer);

    this.descriptionText = addTextObject(10, DESCRIPTION_Y - globalScene.scaledCanvas.height / 2, "", TextStyle.WINDOW, {
      wordWrap: { width: globalScene.scaledCanvas.width - 20 },
      maxLines: 2,
    });
    this.descriptionText.setVisible(false);

    ui.add(this.rootContainer);
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
    this.clearRenderedState();

    const baseShopCost = new NumberHolder(globalScene.getWaveMoneyAmount(1));
    globalScene.applyModifier(HealShopCostModifier, true, baseShopCost);
    const randomTypeOptions = getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, baseShopCost.value);

    this.rows = [];
    if (fixedTypeOptions.length) {
      this.rows.push({ rowCursor: 1, options: fixedTypeOptions });
    }
    this.chunkOptions(randomTypeOptions, 4).forEach((options, index) => {
      this.rows.push({ rowCursor: 2 + index, options });
    });

    this.actions = [
      {
        callbackCursor: 0,
        label: i18next.t("modifierSelectUiHandler:reroll"),
        description: i18next.t("modifierSelectUiHandler:rerollDesc"),
        priceText:
          this.rerollCost >= 0
            ? i18next.t("modifierSelectUiHandler:rerollCost", {
                formattedMoney: formatMoney(globalScene.moneyFormat, this.rerollCost),
              })
            : undefined,
      },
      {
        callbackCursor: 1,
        label: i18next.t("modifierSelectUiHandler:checkTeam"),
        description: i18next.t("modifierSelectUiHandler:checkTeamDesc"),
      },
      {
        callbackCursor: 2,
        label: i18next.t("modifierSelectUiHandler:leaveShopButton"),
        description: i18next.t("modifierSelectUiHandler:leaveShopDesc"),
      },
    ];

    this.rowCursor = this.rows.length ? this.rows[0].rowCursor : 0;
    this.cursor = 0;
    this.actionCursor = 0;

    this.renderFrame();
    this.renderSections();
    this.renderRows();
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
        success = this.rowCursor === 0
          ? !!this.actions[this.actionCursor] && this.onActionInput(0, this.actions[this.actionCursor].callbackCursor)
          : this.onActionInput(this.rowCursor, this.cursor);
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
    this.listContainer.removeAll(true);
    this.actionContainer.removeAll(true);
    this.rows = [];
    this.actions = [];
  }

  private renderFrame() {
    const top = PANEL_Y - globalScene.scaledCanvas.height / 2;
    const left = PANEL_X;
    this.rootContainer.add(addWindow(left, top, PANEL_WIDTH, PANEL_HEIGHT));

    const accent = globalScene.add.rectangle(left + 1, top + PANEL_HEIGHT / 2, 2, PANEL_HEIGHT - 2, 0xd77a2d);
    accent.setOrigin(0, 0.5);
    this.rootContainer.add(accent);

    const fixedLine = globalScene.add.rectangle(INNER_X + 90, FIXED_HEADER_Y - globalScene.scaledCanvas.height / 2 + 6, SECTION_WIDTH - 90, 1, 0xffffff, 0.1);
    fixedLine.setOrigin(0, 0.5);
    this.rootContainer.add(fixedLine);
    const randomLine = globalScene.add.rectangle(INNER_X + 110, RANDOM_HEADER_Y - globalScene.scaledCanvas.height / 2 + 6, SECTION_WIDTH - 110, 1, 0xffffff, 0.08);
    randomLine.setOrigin(0, 0.5);
    this.rootContainer.add(randomLine);
  }

  private renderSections() {
    const fixedLabel = addTextObject(INNER_X, FIXED_HEADER_Y - globalScene.scaledCanvas.height / 2, "FIXED STOCK", TextStyle.WINDOW);
    fixedLabel.setColor("#d77a2d");
    this.rootContainer.add(fixedLabel);

    const randomLabel = addTextObject(INNER_X, RANDOM_HEADER_Y - globalScene.scaledCanvas.height / 2, "RANDOM STOCK", TextStyle.WINDOW);
    randomLabel.setColor(getTextColor(TextStyle.SUMMARY_GRAY));
    this.rootContainer.add(randomLabel);
  }

  private renderRows() {
    const rowMap = new Map(this.rows.map(row => [row.rowCursor, row]));
    const fixedRow = rowMap.get(1);
    if (fixedRow) {
      fixedRow.options.forEach((option, index) => {
        this.renderShopRow(option, FIXED_ROWS_Y + index * ROW_HEIGHT, 1, index);
      });
    }

    const randomRows = this.rows.filter(row => row.rowCursor >= 2);
    randomRows.forEach((row, rowIndex) => {
      row.options.forEach((option, index) => {
        this.renderShopRow(option, RANDOM_ROWS_Y + (rowIndex * row.options.length + index) * ROW_HEIGHT, row.rowCursor, index);
      });
    });
  }

  private renderShopRow(option: ModifierTypeOption, y: number, rowCursor: number, index: number) {
    const top = y - globalScene.scaledCanvas.height / 2;
    const rowBg = globalScene.add.rectangle(INNER_X, top, SECTION_WIDTH, ROW_HEIGHT, 0xffffff, 0.02);
    rowBg.setOrigin(0, 0);
    this.listContainer.add(rowBg);

    const border = globalScene.add.rectangle(INNER_X, top + ROW_HEIGHT - 1, SECTION_WIDTH, 1, 0xffffff, 0.06);
    border.setOrigin(0, 0);
    this.listContainer.add(border);

    const codeText = addTextObject(INNER_X + 14, top + 8, this.getCodeLabel(rowCursor, index), TextStyle.WINDOW);
    codeText.setColor(getTextColor(TextStyle.SUMMARY_GRAY));
    this.listContainer.add(codeText);

    const icon = globalScene.add.sprite(INNER_X + 112, top + 18, "items", option.type.iconImage);
    icon.setScale(1.25);
    this.listContainer.add(icon);

    const nameText = addTextObject(INNER_X + 146, top + 8, option.soldOut ? i18next.t("modifierSelectUiHandler:soldOut") : option.type.name, TextStyle.WINDOW);
    if (option.soldOut) {
      nameText.setColor(getTextColor(TextStyle.SUMMARY_GRAY));
    }
    this.listContainer.add(nameText);

    const priceText = addTextObject(
      INNER_X + SECTION_WIDTH - 96,
      top + 8,
      option.soldOut ? i18next.t("modifierSelectUiHandler:soldOut") : formatMoney(globalScene.moneyFormat, option.cost),
      option.soldOut ? TextStyle.SUMMARY_GRAY : TextStyle.MONEY,
    );
    this.listContainer.add(priceText);
  }

  private renderActions() {
    const barY = ACTION_BAR_Y - globalScene.scaledCanvas.height / 2;
    const widths = [150, 170, 150];
    const xs = [INNER_X, INNER_X + 164, INNER_X + 348];

    this.actions.forEach((action, index) => {
      const width = widths[index];
      const x = xs[index];
      const window = addWindow(x, barY, width, 28);
      this.actionContainer.add(window);

      const label = addTextObject(x + 12, barY + 6, action.label, TextStyle.PARTY);
      this.actionContainer.add(label);

      if (action.priceText) {
        const price = addTextObject(x + width - 12, barY + 6, action.priceText, TextStyle.MONEY);
        price.setOrigin(1, 0);
        this.actionContainer.add(price);
      }
    });
  }

  private moveVertical(direction: -1 | 1): boolean {
    const rows = this.getAvailableRowOrder();
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
      this.rootContainer.add(this.cursorObj);
    }

    if (this.rowCursor === 0) {
      const xs = [INNER_X + 6, INNER_X + 170, INNER_X + 354];
      this.cursorObj.setScale(1);
      this.cursorObj.setPosition(xs[this.actionCursor], ACTION_BAR_Y - globalScene.scaledCanvas.height / 2 + 14);
      this.descriptionText.setText(this.actions[this.actionCursor]?.description ?? "");
      return;
    }

    const rowIndex = this.rows.findIndex(row => row.rowCursor === this.rowCursor);
    const baseY = this.rowCursor === 1
      ? FIXED_ROWS_Y
      : RANDOM_ROWS_Y + rowIndex * 4 * ROW_HEIGHT - ROW_HEIGHT;
    this.cursorObj.setScale(1);
    this.cursorObj.setPosition(INNER_X + 6, baseY - globalScene.scaledCanvas.height / 2 + this.cursor * ROW_HEIGHT + 14);

    const option = this.getCurrentRowOptions()[this.cursor];
    this.descriptionText.setText(option?.type.getDescription() ?? "");
  }

  private getAvailableRowOrder(): number[] {
    return [0, ...this.rows.map(row => row.rowCursor)];
  }

  private getCurrentRowOptions(): ModifierTypeOption[] {
    return this.rows.find(row => row.rowCursor === this.rowCursor)?.options ?? [];
  }

  private chunkOptions(options: ModifierTypeOption[], size: number): ModifierTypeOption[][] {
    const rows: ModifierTypeOption[][] = [];
    for (let i = 0; i < options.length; i += size) {
      rows.push(options.slice(i, i + size));
    }
    return rows;
  }

  private getCodeLabel(rowCursor: number, index: number): string {
    if (rowCursor === 1) {
      return `FX-0${index + 1}`;
    }
    const offset = (rowCursor - 2) * 4 + index + 1;
    return `RD-0${offset}`;
  }

  private eraseCursor() {
    if (this.cursorObj) {
      this.cursorObj.destroy();
      this.cursorObj = null;
    }
  }
}
