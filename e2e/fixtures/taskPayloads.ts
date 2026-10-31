import { SettlementWindow, Task } from '@src/types/settlement.types';
import { windowForRun } from '@src/services/settlement.service';

export const RUN_AT = new Date('2026-10-27T09:00:00Z');

export const WINDOW: SettlementWindow = windowForRun(RUN_AT);
export const WINDOW_START_ISO = '2026-10-19T00:00:00Z';
export const WINDOW_END_ISO = '2026-10-26T00:00:00Z';

export const DEFAULT_USER = 'user-1';

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

export const TaskPayloads = {
  inWindow(overrides: Partial<Task> = {}): Task {
    return {
      task_id: nextId('task'),
      user_id: DEFAULT_USER,
      completed_at: '2026-10-21T12:00:00Z',
      ...overrides,
    };
  },

  atUpperBoundary(overrides: Partial<Task> = {}): Task {
    return {
      task_id: nextId('upper'),
      user_id: DEFAULT_USER,
      completed_at: WINDOW_END_ISO,
      ...overrides,
    };
  },

  atLowerBoundary(overrides: Partial<Task> = {}): Task {
    return {
      task_id: nextId('lower'),
      user_id: DEFAULT_USER,
      completed_at: WINDOW_START_ISO,
      ...overrides,
    };
  },

  istInsideWindow(overrides: Partial<Task> = {}): Task {
    return {
      task_id: nextId('ist-in'),
      user_id: DEFAULT_USER,
      completed_at: '2026-10-26T04:00:00+05:30',
      ...overrides,
    };
  },

  istOutsideWindow(overrides: Partial<Task> = {}): Task {
    return {
      task_id: nextId('ist-out'),
      user_id: DEFAULT_USER,
      completed_at: '2026-10-19T04:00:00+05:30',
      ...overrides,
    };
  },

  duplicatePair(): Task[] {
    const t = TaskPayloads.inWindow({ task_id: nextId('dup') });
    return [t, { ...t }];
  },

  malformed(): unknown[] {
    return [
      { user_id: DEFAULT_USER, completed_at: '2026-10-21T12:00:00Z' },
      { task_id: nextId('bad'), user_id: DEFAULT_USER, completed_at: 'not-a-date' },
      { task_id: nextId('bad'), user_id: DEFAULT_USER, completed_at: '2026-10-21T12:00:00' },
      { task_id: 123, user_id: DEFAULT_USER, completed_at: '2026-10-21T12:00:00Z' },
      null,
    ];
  },
};
