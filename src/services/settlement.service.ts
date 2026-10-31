import {
  BatchResult,
  CREDITS_PER_TASK,
  NotificationStatus,
  PayoutRecord,
  SettlementState,
  SettlementWindow,
  SkippedTask,
  Task,
  UserAccount,
} from '../types/settlement.types';
import { NotificationService } from './notification.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function windowForRun(runAt: Date): SettlementWindow {
  const midnight = Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), runAt.getUTCDate());
  const end = midnight - DAY_MS;
  return { start: new Date(end - 7 * DAY_MS), end: new Date(end) };
}

export interface SettlementServiceOptions {
  enableIdempotencyFix?: boolean;
}

export class SettlementService {
  private readonly accounts = new Map<string, UserAccount>();
  private readonly processedTasks = new Set<string>();
  private payouts: PayoutRecord[] = [];
  private batchCounter = 0;
  private readonly defaultFix: boolean;

  constructor(
    private readonly notifier: NotificationService,
    options: SettlementServiceOptions = {},
  ) {
    this.defaultFix = options.enableIdempotencyFix ?? false;
  }

  async processBatch(
    tasks: unknown[],
    window: SettlementWindow,
    enableIdempotencyFix: boolean = this.defaultFix,
  ): Promise<BatchResult> {
    const batch_id = `batch-${++this.batchCounter}`;
    const result: BatchResult = { batch_id, payouts: [], skipped: [] };
    const seenInBatch = new Set<string>();

    for (const raw of tasks) {
      const task = this.validate(raw, result.skipped);
      if (!task) continue;

      const completedMs = Date.parse(task.completed_at);
      if (!(completedMs >= window.start.getTime() && completedMs < window.end.getTime())) {
        result.skipped.push({ task: raw, reason: 'OUTSIDE_WINDOW' });
        continue;
      }

      if (seenInBatch.has(task.task_id)) {
        result.skipped.push({ task: raw, reason: 'DUPLICATE_IN_BATCH' });
        continue;
      }
      seenInBatch.add(task.task_id);

      if (enableIdempotencyFix && this.processedTasks.has(task.task_id)) {
        result.skipped.push({ task: raw, reason: 'ALREADY_SETTLED' });
        continue;
      }

      const payout = this.credit(task, batch_id);
      result.payouts.push(payout);

      payout.notification_status = await this.notifySafely(task);
    }

    return result;
  }

  getBalance(userId: string): number {
    return this.accounts.get(userId)?.balance ?? 0;
  }

  getState(): SettlementState {
    const balances: Record<string, number> = {};
    this.accounts.forEach((a) => (balances[a.user_id] = a.balance));
    const statusByTask: Record<string, NotificationStatus> = {};
    this.payouts.forEach((p) => (statusByTask[p.task_id] = p.notification_status));
    return {
      ledger: { balances, payouts: this.payouts.map((p) => ({ ...p })) },
      processedTasks: Array.from(this.processedTasks),
      notifications: { log: this.notifier.getLog(), statusByTask },
    };
  }

  reset(): void {
    this.accounts.clear();
    this.processedTasks.clear();
    this.payouts = [];
    this.batchCounter = 0;
    this.notifier.reset();
  }

  private credit(task: Task, batch_id: string): PayoutRecord {
    const account =
      this.accounts.get(task.user_id) ?? { user_id: task.user_id, balance: 0 };
    account.balance += CREDITS_PER_TASK;
    this.accounts.set(task.user_id, account);
    this.processedTasks.add(task.task_id);

    const payout: PayoutRecord = {
      task_id: task.task_id,
      user_id: task.user_id,
      amount: CREDITS_PER_TASK,
      batch_id,
      paid_at: new Date().toISOString(),
      notification_status: NotificationStatus.NOT_SENT,
    };
    this.payouts.push(payout);
    return payout;
  }

  private async notifySafely(task: Task): Promise<NotificationStatus> {
    try {
      const res = await this.notifier.send(task.user_id, task.task_id);
      return res.status;
    } catch {
      return NotificationStatus.FAILED;
    }
  }

  private validate(raw: unknown, skipped: SkippedTask[]): Task | null {
    const t = raw as Partial<Task> | null;
    if (
      !t ||
      typeof t !== 'object' ||
      typeof t.task_id !== 'string' || t.task_id.trim() === '' ||
      typeof t.user_id !== 'string' || t.user_id.trim() === '' ||
      typeof t.completed_at !== 'string'
    ) {
      skipped.push({ task: raw, reason: 'INVALID_PAYLOAD' });
      return null;
    }
    if (!ISO_WITH_OFFSET.test(t.completed_at) || Number.isNaN(Date.parse(t.completed_at))) {
      skipped.push({ task: raw, reason: 'INVALID_TIMESTAMP' });
      return null;
    }
    return t as Task;
  }
}
