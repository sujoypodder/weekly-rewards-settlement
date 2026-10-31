import { expect } from '@playwright/test';
import { NotificationService } from '@src/services/notification.service';
import { SettlementService } from '@src/services/settlement.service';
import {
  BatchResult,
  CREDITS_PER_TASK,
  NotificationStatus,
  SettlementState,
  SettlementWindow,
} from '@src/types/settlement.types';
import { SettlementLocators as L, resolvePath } from '../locators/settlement.locators';
import { WINDOW } from '../fixtures/taskPayloads';

export const IDEMPOTENCY_FIX_ENABLED = process.env.ENABLE_IDEMPOTENCY_FIX === 'true';

export class SettlementController {
  readonly notifier = new NotificationService();
  service: SettlementService;
  lastResult?: BatchResult;

  constructor(enableIdempotencyFix: boolean = IDEMPOTENCY_FIX_ENABLED) {
    this.service = new SettlementService(this.notifier, { enableIdempotencyFix });
  }

  reset(): void {
    this.service.reset();
    this.lastResult = undefined;
  }

  simulateNotificationFailure(httpStatus = 500): void {
    this.notifier.simulateFailure(httpStatus);
  }

  async runBatch(tasks: unknown[], window: SettlementWindow = WINDOW): Promise<BatchResult> {
    this.lastResult = await this.service.processBatch(tasks, window);
    return this.lastResult;
  }

  async retryBatch(tasks: unknown[], window: SettlementWindow = WINDOW): Promise<BatchResult> {
    return this.runBatch(tasks, window);
  }

  state(): SettlementState {
    return this.service.getState();
  }

  getBalance(userId: string): number {
    return resolvePath<number>(this.state(), L.LEDGER_BALANCE(userId)) ?? 0;
  }

  getProcessedTasks(): string[] {
    return resolvePath<string[]>(this.state(), L.PROCESSED_TASKS) ?? [];
  }

  getNotificationStatus(taskId: string): NotificationStatus | undefined {
    return resolvePath<NotificationStatus>(this.state(), L.NOTIFICATION_STATUS_OF(taskId));
  }

  getNotificationCount(): number {
    return (resolvePath<unknown[]>(this.state(), L.NOTIFICATION_LOG) ?? []).length;
  }

  getPayoutCount(): number {
    return (resolvePath<unknown[]>(this.state(), L.LEDGER_PAYOUTS) ?? []).length;
  }

  expectBalance(userId: string, expected: number): void {
    expect(this.getBalance(userId), `balance of ${userId}`).toBe(expected);
  }

  expectCredited(userId: string, taskCount: number): void {
    this.expectBalance(userId, taskCount * CREDITS_PER_TASK);
  }

  expectNotificationStatus(taskId: string, expected: NotificationStatus): void {
    expect(this.getNotificationStatus(taskId), `notification for ${taskId}`).toBe(expected);
  }

  expectNoNotifications(): void {
    expect(this.getNotificationCount(), 'notifications dispatched').toBe(0);
  }

  expectProcessed(taskId: string): void {
    expect(this.getProcessedTasks()).toContain(taskId);
  }

  expectSkippedReasons(reasons: string[]): void {
    const actual = (this.lastResult?.skipped ?? []).map((s) => s.reason);
    expect(actual).toEqual(reasons);
  }

  expectNotificationsOnlyAfterPayout(): void {
    const st = this.state();
    const paid = new Set(st.ledger.payouts.map((p) => p.task_id));
    for (const n of st.notifications.log) {
      expect(paid.has(n.task_id), `notification for unpaid task ${n.task_id}`).toBe(true);
    }
  }
}
