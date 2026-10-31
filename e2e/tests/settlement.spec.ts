import { test, expect } from '@playwright/test';
import { NotificationStatus } from '@src/types/settlement.types';
import { SettlementController } from '../controllers/settlement.controller';
import { DEFAULT_USER, TaskPayloads } from '../fixtures/taskPayloads';

test.describe('Weekly rewards settlement', () => {
  let ctrl: SettlementController;

  test.beforeEach(() => {
    ctrl = new SettlementController();
    ctrl.reset();
  });

  test('1. Happy path: in-window task earns 10 credits and notification is sent', async () => {
    const task = TaskPayloads.inWindow();
    await ctrl.runBatch([task]);

    ctrl.expectCredited(DEFAULT_USER, 1);
    ctrl.expectProcessed(task.task_id);
    ctrl.expectNotificationStatus(task.task_id, NotificationStatus.SENT);
    ctrl.expectNotificationsOnlyAfterPayout();
  });

  test('2. Upper boundary excluded: task at following Monday 00:00 UTC earns 0', async () => {
    const task = TaskPayloads.atUpperBoundary();
    await ctrl.runBatch([task]);

    ctrl.expectBalance(DEFAULT_USER, 0);
    ctrl.expectNoNotifications();
    ctrl.expectSkippedReasons(['OUTSIDE_WINDOW']);
  });

  test('3. Lower boundary included: task at start Monday 00:00 UTC earns 10', async () => {
    const task = TaskPayloads.atLowerBoundary();
    await ctrl.runBatch([task]);

    ctrl.expectCredited(DEFAULT_USER, 1);
    ctrl.expectNotificationStatus(task.task_id, NotificationStatus.SENT);
  });

  test('4. Timezone normalization: IST (+05:30) timestamps are evaluated in UTC', async () => {
    const inside = TaskPayloads.istInsideWindow();
    const outside = TaskPayloads.istOutsideWindow();
    await ctrl.runBatch([inside, outside]);

    ctrl.expectCredited(DEFAULT_USER, 1);
    ctrl.expectProcessed(inside.task_id);
    expect(ctrl.getProcessedTasks()).not.toContain(outside.task_id);
    ctrl.expectSkippedReasons(['OUTSIDE_WINDOW']);
  });

  test('5. Duplicate task in same batch: same task_id twice is credited once', async () => {
    await ctrl.runBatch(TaskPayloads.duplicatePair());

    ctrl.expectCredited(DEFAULT_USER, 1);
    expect(ctrl.getPayoutCount()).toBe(1);
    expect(ctrl.getNotificationCount()).toBe(1);
    ctrl.expectSkippedReasons(['DUPLICATE_IN_BATCH']);
  });

  test('6. [DEFECT REPRODUCTION] Batch retry is idempotent: must not yield 20 credits', async () => {
    const batch = [TaskPayloads.inWindow()];
    await ctrl.runBatch(batch);
    await ctrl.retryBatch(batch);

    ctrl.expectBalance(DEFAULT_USER, 10);
    expect(ctrl.getPayoutCount()).toBe(1);
    expect(ctrl.getNotificationCount()).toBe(1);
  });

  test('7. Notification failure isolation: HTTP 500 does not roll back the payout', async () => {
    const task = TaskPayloads.inWindow();
    ctrl.simulateNotificationFailure(500);
    await ctrl.runBatch([task]);

    ctrl.expectCredited(DEFAULT_USER, 1);
    ctrl.expectProcessed(task.task_id);
    ctrl.expectNotificationStatus(task.task_id, NotificationStatus.FAILED);
    expect(ctrl.getPayoutCount()).toBe(1);
  });

  test('8. Partial failure: invalid payloads are skipped without halting the batch', async () => {
    const good1 = TaskPayloads.inWindow();
    const good2 = TaskPayloads.inWindow();
    const bad = TaskPayloads.malformed();
    await ctrl.runBatch([good1, ...bad, good2]);

    ctrl.expectCredited(DEFAULT_USER, 2);
    ctrl.expectProcessed(good1.task_id);
    ctrl.expectProcessed(good2.task_id);
    expect(ctrl.lastResult?.skipped).toHaveLength(bad.length);
    ctrl.expectNotificationsOnlyAfterPayout();
  });
});
