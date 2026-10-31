# Directive: Idempotent Weekly Settlement

**Author:** Sujoy Podder
**Project:** rewards-settlement-quest

---

## 1. Specification

### 1.1 Schedule and window

- Settlement runs every Tuesday at 09:00 UTC.
- The window is `[start, end)`.
  - `start` is a Monday 00:00 UTC and is included.
  - `end` is the following Monday 00:00 UTC and is strictly excluded.
- `windowForRun()` builds the window from the run time. The start is the Monday 8 days before the run and the end is the Monday 1 day before the run.

### 1.2 Payout

- 10 test credits for each qualifying task.

### 1.3 Rules

1. A `task_id` is counted exactly once.
2. A retry must not trigger a second payout.
3. A notification is sent only after a successful payout.
4. A notification failure must not reverse or roll back the payout.

### 1.4 Input contract

```json
{
  "task_id": "string",
  "user_id": "string",
  "completed_at": "ISO-8601 timestamp with an explicit offset"
}
```

- Timestamps are converted to UTC before the window check.
- A record is skipped, with a reason, if the ids are missing or not strings, the timestamp cannot be parsed or has no offset, or the record is `null`.
- A skipped record never stops the rest of the batch.

### 1.5 Fix switch

`SettlementService` accepts `enableIdempotencyFix` as a constructor option and as an override on `processBatch`. It defaults to `false`, which keeps the defect reproducible. The tests read it from the `ENABLE_IDEMPOTENCY_FIX` environment variable.

### 1.6 Layout

```
rewards-settlement-quest/
├── package.json
├── tsconfig.json
├── playwright.config.ts
├── intent.md
├── directive.md
├── src/
│   ├── types/settlement.types.ts
│   └── services/
│       ├── notification.service.ts
│       └── settlement.service.ts
└── e2e/
    ├── locators/settlement.locators.ts
    ├── fixtures/taskPayloads.ts
    ├── controllers/settlement.controller.ts
    └── tests/settlement.spec.ts
```

### 1.7 Processing order

For each record in a batch:

1. Validate the payload and timestamp.
2. Check the window in UTC.
3. Skip a repeated `task_id` inside the same payload.
4. Skip a task that was settled in an earlier batch (only when the fix is enabled).
5. Credit the user and record the task as processed.
6. Send the notification, isolated from the payout.

---

## 2. Test Cases

Window under test: `[2026-10-19T00:00:00Z, 2026-10-26T00:00:00Z)`. Default user: `user-1`.

| # | Test | Input | Expected result |
|:-:|------|-------|-----------------|
| 1 | Happy path | One task at `2026-10-21T12:00:00Z` | Balance 10, task processed, notification `SENT` |
| 2 | Upper boundary excluded | One task at `2026-10-26T00:00:00Z` | Balance 0, no notification, skipped as `OUTSIDE_WINDOW` |
| 3 | Lower boundary included | One task at `2026-10-19T00:00:00Z` | Balance 10, notification `SENT` |
| 4 | Timezone normalization | Task A at `2026-10-26T04:00:00+05:30` (Oct 25 22:30Z) and task B at `2026-10-19T04:00:00+05:30` (Oct 18 22:30Z) | A is paid, B is skipped as `OUTSIDE_WINDOW`, balance 10 |
| 5 | Duplicate task in same batch | The same `task_id` twice in one payload | Balance 10, one payout, one notification, second copy skipped as `DUPLICATE_IN_BATCH` |
| 6 | Batch retry / idempotency | The same batch submitted twice | Balance 10 (buggy engine gives 20), one payout, one notification |
| 7 | Notification failure isolation | One valid task, notifier returns HTTP 500 | Balance 10, task processed, notification `FAILED` |
| 8 | Partial failure / invalid data | A valid task, five malformed records, then another valid task | Balance 20, both valid tasks processed, five records skipped |

---

## 3. Defect Report

| Field | Detail |
|-------|--------|
| ID | DEF-SETTLE-001 |
| Title | Duplicate payout when a settlement batch is retried |
| Severity | P0 Blocker |
| Component | `SettlementService.processBatch` in `src/services/settlement.service.ts` |
| Found by | Test 6 in `e2e/tests/settlement.spec.ts` |
| Reported by | Sujoy Podder |

### 3.1 Steps to reproduce

1. Create `SettlementService` with `enableIdempotencyFix` set to `false`.
2. Submit a batch with one in-window task for `user-1`.
3. Submit the same batch again.

### 3.2 Expected and actual

| | Balance | Payout records | Notifications |
|---|:-------:|:--------------:|:-------------:|
| Expected | 10 | 1 | 1 |
| Actual | 20 | 2 | 2 |

### 3.3 Root cause

`processBatch` removes duplicate `task_id` values only within the payload of the current call, using a `Set` that is created fresh on every call. The processed-task registry is written to when a user is credited but is never read before crediting. A re-submitted batch is therefore treated as new work and is paid again.

### 3.4 Fix

Check the registry before crediting and skip tasks that were already settled:

```ts
if (enableIdempotencyFix && this.processedTasks.has(task.task_id)) {
  result.skipped.push({ task: raw, reason: 'ALREADY_SETTLED' });
  continue;
}
```

This protects sequential retries inside one process. For production the same check needs a unique constraint on `task_id`, applied in the same transaction as the credit, so that two runs at the same time cannot both pass it.

### 3.5 Verification

| Run | Command | Result |
|-----|---------|--------|
| Red | `npx playwright test` | Test 6 fails with Expected 10 and Received 20, the other 7 pass |
| Green | `npm run test:fixed` | All 8 tests pass |

### 3.6 CI release blockers

- **Gate 1.** `ENABLE_IDEMPOTENCY_FIX=true npx playwright test` must pass 8 of 8. Any failure blocks the release.
- **Gate 2.** Test 6 is mandatory. It must not be skipped or marked `fixme`, and `forbidOnly` stays on in CI.
- **Gate 3.** The production default for `enableIdempotencyFix` must be `true` before deployment. The `false` default exists only to reproduce the defect.
- **Gate 4.** `npm run typecheck` must pass.

---

## 4. AI Collaboration Disclosure

I wrote the specification, the folder structure, the business rules and the 8 test cases for this quest. I used the Cursor AI assistant to speed up scaffolding and drafting. I reviewed the code, ran the tests myself, and I am responsible for the final result and for the assumptions listed below.

Assumptions I made:

- The weekly window is the Monday 8 days before the Tuesday run up to the Monday 1 day before it.
- Task timestamps must include an explicit offset. Anything else is treated as malformed.
- The processed-task registry is global per `task_id` and is not scoped to a window.

---

## 5. Run Instructions

**Requirements:** Node.js 18 or newer and npm. No browser is needed.

```bash
npm install
npm run typecheck
```

**Red run** (defect present, Test 6 fails):

```bash
npx playwright test
```

**Green run** (fix enabled, all 8 tests pass):

```bash
npm run test:fixed
```

Without `npm` scripts:

```bash
# macOS / Linux
ENABLE_IDEMPOTENCY_FIX=true npx playwright test

# Windows PowerShell
$env:ENABLE_IDEMPOTENCY_FIX='true'; npx playwright test
```
