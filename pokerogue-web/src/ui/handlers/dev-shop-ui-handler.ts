import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { GameModes } from "#enums/game-modes";
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
import Phaser from "phaser";

type ShopRowView = {
  rowCursor: number;
  options: ModifierTypeOption[];
  xPositions: number[];
};

type ActionView = {
  label: string;
  cursor: number;
  x: number;
  text: Phaser.GameObjects.Text;
};

export class DevShopUiHandler extends AwaitableUiHandler {
  protected declare onActionInput: ModifierSelectCallback | null;

  private container: Phaser.GameObjects.Container;
  private descriptionText: Phaser.GameObjects.Text;
  private cursorObj: Phaser.GameObjects.Image | null = null;
  private rowCursor = 1;
  private rowViews: ShopRowView[] = [];
  private actionViews: ActionView[] = [];
  private actionCursors: number[] = [];
  private player = true;
  private typeOptions: ModifierTypeOption[] = [];
  private rerollCost = -1;

  constructor() {
    super(UiMode.DEV_SHOP);
  }

  setup(): void {
    const ui = this.getUi();
    this.container = globalScene.add.container(0, 0);
    ui.add(this.container);

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

    this.player = !!args[0];
    this.typeOptions = args[1] as ModifierTypeOption[];
    this.onActionInput = args[2] as ModifierSelectCallback;
    this.rerollCost = args[3] as number;
    this.awaitingActionInput = true;
    this.cursor = 0;
    this.rowCursor = 1;

    this.container.removeAll(true);
    this.rowViews = [];
    this.actionViews = [];
    this.actionCursors = [];

    const baseShopCost = new NumberHolder(globalScene.getWaveMoneyAmount(1));
    globalScene.applyModifier(HealShopCostModifier, true, baseShopCost);
    const randomOptions = getPlayerShopModifierTypeOptionsForWave(globalScene.currentBattle.waveIndex, baseShopCost.value);

    this.buildRowWindow(this.typeOptions, -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 - 58, 1);
    this.buildRowWindow(randomOptions, -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 - 24, 2);
    if (randomOptions.length > 7) {
      this.buildRowWindow(randomOptions.slice(7), -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 + 4, 3);
    }

    this.buildActions();
    this.descriptionText.setVisible(true);
    this.setCursor(0);

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
        success = this.onActionInput(this.rowCursor, this.cursor);
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
    this.container.removeAll(true);
    this.rowViews = [];
    this.actionViews = [];
    this.actionCursors = [];
    this.descriptionText.setVisible(false);
    this.eraseCursor();
  }

  private buildRowWindow(options: ModifierTypeOption[], y: number, rowCursor: number) {
    if (!options.length) {
      return;
    }
    const visibleOptions = rowCursor === 2 ? options.slice(0, 7) : options;
    const width = globalScene.scaledCanvas.width - 20;
    const window = addWindow(10, y, width, 28);
    this.container.add(window);

    const sliceWidth = globalScene.scaledCanvas.width / (visibleOptions.length + 2);
    const xPositions: number[] = [];

    visibleOptions.forEach((option, index) => {
      const x = sliceWidth * (index + 1) + sliceWidth * 0.5;
      xPositions.push(x);
      const sprite = globalScene.add.sprite(x, y + 8, "items", option.type.iconImage);
      sprite.setScale(2);
      this.container.add(sprite);

      const nameText = addTextObject(x, y + 17, option.soldOut ? "매진" : option.type.name, TextStyle.WINDOW, {
        align: "center",
      });
      nameText.setOrigin(0.5, 0);
      if (option.soldOut) {
        nameText.setColor(getTextColor(TextStyle.SUMMARY_GRAY));
      }
      this.container.add(nameText);

      const costText = addTextObject(
        x,
        y + 28,
        option.soldOut ? "매진" : formatMoney(globalScene.moneyFormat, option.cost),
        option.soldOut ? TextStyle.SUMMARY_GRAY : TextStyle.MONEY,
      );
      costText.setOrigin(0.5, 0);
      this.container.add(costText);
    });

    this.rowViews.push({
      rowCursor,
      options: visibleOptions,
      xPositions,
    });
  }

  private buildActions() {
    const y = -70;
    const labels = ["리롤", "파티 확인", "상점 나가기"];
    const cursors = [0, 1, 2];
    const xs = [30, globalScene.scaledCanvas.width - 74, 30];

    labels.forEach((label, index) => {
      const text = addTextObject(xs[index], y + index * 18, label, TextStyle.WINDOW_BATTLE_COMMAND);
      this.container.add(text);
      this.actionViews.push({ label, cursor: cursors[index], x: xs[index], text });
      this.actionCursors.push(cursors[index]);
    });
  }

  private moveVertical(direction: -1 | 1): boolean {
    const rowOrder = [0, 1, 2, 3].filter(row => row === 0 || this.getRowView(row));
    const currentIndex = rowOrder.indexOf(this.rowCursor);
    const nextIndex = currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= rowOrder.length) {
      return false;
    }
    const nextRow = rowOrder[nextIndex];
    this.rowCursor = nextRow;
    this.cursor = 0;
    this.refreshCursor();
    return true;
  }

  private moveHorizontal(direction: -1 | 1): boolean {
    if (this.rowCursor === 0) {
      const currentIndex = this.actionCursors.indexOf(this.cursor);
      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= this.actionCursors.length) {
        return false;
      }
      this.cursor = this.actionCursors[nextIndex];
      this.refreshCursor();
      return true;
    }
    const rowView = this.getRowView(this.rowCursor);
    if (!rowView) {
      return false;
    }
    const nextIndex = this.cursor + direction;
    if (nextIndex < 0 || nextIndex >= rowView.options.length) {
      return false;
    }
    this.cursor = nextIndex;
    this.refreshCursor();
    return true;
  }

  setCursor(cursor: number): boolean {
    this.cursor = cursor;
    this.refreshCursor();
    return true;
  }

  private refreshCursor() {
    const ui = this.getUi();
    if (!this.cursorObj) {
      this.cursorObj = globalScene.add.image(0, 0, "cursor");
      this.container.add(this.cursorObj);
    }

    if (this.rowCursor === 0) {
      const action = this.actionViews.find(view => view.cursor === this.cursor) ?? this.actionViews[0];
      if (!action) {
        return;
      }
      this.cursorObj.setPosition(action.x - 14, action.text.y + 8);
      this.descriptionText.setText(action.label);
      return;
    }

    const rowView = this.getRowView(this.rowCursor);
    if (!rowView) {
      return;
    }
    const index = Math.min(this.cursor, rowView.options.length - 1);
    this.cursor = index;
    const option = rowView.options[index];
    this.cursorObj.setPosition(rowView.xPositions[index] - 16, this.getCursorYForRow(this.rowCursor));
    this.descriptionText.setText(option.type.getDescription());
  }

  private getCursorYForRow(rowCursor: number): number {
    switch (rowCursor) {
      case 1:
        return -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 - 50;
      case 2:
        return -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 - 16;
      case 3:
        return -globalScene.scaledCanvas.height / 2 - globalScene.game.canvas.height / 32 + 12;
      default:
        return -62;
    }
  }

  private getRowView(rowCursor: number): ShopRowView | undefined {
    return this.rowViews.find(view => view.rowCursor === rowCursor);
  }

  private eraseCursor() {
    if (this.cursorObj) {
      this.cursorObj.destroy();
      this.cursorObj = null;
    }
  }
}
