import { NotificationLogEntry, NotificationStatus } from '../types/settlement.types';

export interface NotificationResult {
  status: NotificationStatus;
  http_status: number;
}

export class NotificationService {
  private failureStatus: number | null = null;
  private log: NotificationLogEntry[] = [];
  private seq = 0;

  simulateFailure(httpStatus = 500): void {
    this.failureStatus = httpStatus;
  }

  clearFailure(): void {
    this.failureStatus = null;
  }

  async send(userId: string, taskId: string): Promise<NotificationResult> {
    const failed = this.failureStatus !== null;
    const result: NotificationResult = failed
      ? { status: NotificationStatus.FAILED, http_status: this.failureStatus as number }
      : { status: NotificationStatus.SENT, http_status: 200 };

    this.log.push({
      seq: ++this.seq,
      task_id: taskId,
      user_id: userId,
      status: result.status,
      http_status: result.http_status,
    });
    return result;
  }

  getLog(): NotificationLogEntry[] {
    return this.log.map((e) => ({ ...e }));
  }

  reset(): void {
    this.failureStatus = null;
    this.log = [];
    this.seq = 0;
  }
}
