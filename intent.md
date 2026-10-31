# Intent: Preventing Duplicate Payouts in the Weekly Settlement Flow

**Author:** Sujoy Podder
**Project:** rewards-settlement-quest

---

## 1. Context

Every Tuesday at 09:00 UTC the system settles completed tasks and pays 10 test credits per qualifying task. The window runs from Monday 00:00 UTC up to, but not including, the following Monday 00:00 UTC.

The flow touches money, so a failure here is a financial incident and not just a bug. This document ranks the ways the flow can fail, explains which one I chose to fix first, and states what is out of scope.

---

## 2. Problem Ranking Matrix

Scoring uses a 1 to 5 scale.

- **Impact:** 5 is the worst outcome.
- **Likelihood:** 5 is the most frequent.
- **Effort:** 5 is the most work.
- **Priority** = (Impact x Likelihood) / Effort.

| Rank | Failure mode | Impact | Likelihood | Effort | Priority |
|:----:|--------------|:------:|:----------:|:------:|:--------:|
| 1 | Batch retry without an idempotency check pays the same task twice | 5 | 4 | 2 | 10.0 |
| 2 | Notification failure rolls back or blocks the payout | 4 | 3 | 2 | 6.0 |
| 3 | Timezone (+05:30) handled wrongly, moving tasks across the window | 3 | 3 | 2 | 4.5 |
| 4 | Upper boundary off by one (`<=` used instead of `<`) | 2 | 2 | 1 | 4.0 |
| 5 | Same `task_id` appears twice in one payload and is paid twice | 2 | 2 | 1 | 4.0 |
| 6 | One malformed record stops the whole batch | 3 | 3 | 3 | 3.0 |

---

## 3. Why Retry / Idempotency Is Ranked #1

1. **It is direct financial loss.** Each retry of a batch pays every task again. Credits behave like money and are hard to take back once spent.
2. **It happens in normal operation.** Job timeouts, worker restarts, at-least-once queues and an operator re-running a batch that looked failed all cause the same payload to be submitted again. Nothing unusual has to go wrong.
3. **Reliability work makes it worse.** The more retry logic the system gains, the more often this defect fires.
4. **It fails silently.** No error is raised. Balances are simply wrong and are usually found later during reconciliation.
5. **The fix is small and certain.** Checking a processed-task registry before crediting is a few lines, and one deterministic test (Test 6, expected 10 and actual 20) proves it.
6. **The other failures are bounded or visible.** Boundary, timezone and malformed-data problems affect a known subset of one run and are covered by their own tests. A lost notification costs a message, not money.

---

## 4. Affected Users

| Group | Effect |
|-------|--------|
| End users | Receive inflated balances, then see corrections that reduce them |
| Finance | Over-disbursement and manual reconciliation work |
| Operations / on-call | Cannot tell whether re-running a failed batch is safe, which delays recovery |
| Support | Handles disputes when balances are corrected |
| QA and release engineering | Need a regression gate that proves retries are safe before each release |

---

## 5. Intended Value

- A task is paid at most once, however many times its batch is submitted.
- Operators can retry any batch without risk, which shortens incident recovery.
- Notification problems never change ledger state.
- A repeatable suite of 8 tests fails on the defect and passes on the fix, and it can run as a release gate.
- Every credit can be traced back to exactly one task through the processed-task registry and payout records.

---

## 6. Non-Goals

- Real payment rails, databases, queues or persistence. The engine is an in-memory simulation.
- Concurrency control for two batches running at the same time. This work covers sequential retries only.
- Notification delivery guarantees such as retry with backoff or dead-letter queues.
- Recovering credits that were already paid twice in the past.
- Browser or UI testing. All tests are service-level.
- Any change to the business rules: 10 credits per task and the `[start, end)` window.
