export const CREDITS_PER_TASK = 10;

export interface Task {
  task_id: string;
  user_id: string;

  completed_at: string;
}

export interface SettlementWindow {
  start: Date;
  end: Date;
}

export enum NotificationStatus {
  NOT_SENT = 'NOT_SENT',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export interface PayoutRecord {
  task_id: string;
  user_id: string;
  amount: number;
  batch_id: string;
  paid_at: string;
  notification_status: NotificationStatus;
}

export interface UserAccount {
  user_id: string;
  balance: number;
}

export interface SkippedTask {
  task: unknown;
  reason:
    | 'INVALID_PAYLOAD'
    | 'INVALID_TIMESTAMP'
    | 'OUTSIDE_WINDOW'
    | 'DUPLICATE_IN_BATCH'
    | 'ALREADY_SETTLED';
}

export interface BatchResult {
  batch_id: string;
  payouts: PayoutRecord[];
  skipped: SkippedTask[];
}

export interface NotificationLogEntry {
  seq: number;
  task_id: string;
  user_id: string;
  status: NotificationStatus;
  http_status: number;
}

export interface SettlementState {
  ledger: {
    balances: Record<string, number>;
    payouts: PayoutRecord[];
  };
  processedTasks: string[];
  notifications: {
    log: NotificationLogEntry[];
    statusByTask: Record<string, NotificationStatus>;
  };
}
