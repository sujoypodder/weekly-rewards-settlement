export const SettlementLocators = {
  LEDGER_BALANCES: 'ledger.balances',
  LEDGER_PAYOUTS: 'ledger.payouts',
  PROCESSED_TASKS: 'processedTasks',
  NOTIFICATION_LOG: 'notifications.log',
  NOTIFICATION_STATUS: 'notifications.statusByTask',

  LEDGER_BALANCE: (userId: string): string => `ledger.balances.${userId}`,

  NOTIFICATION_STATUS_OF: (taskId: string): string => `notifications.statusByTask.${taskId}`,

  RESPONSE_PAYOUTS: 'payouts',
  RESPONSE_SKIPPED: 'skipped',
} as const;

export function resolvePath<T = unknown>(source: unknown, path: string): T | undefined {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, source) as T | undefined;
}
