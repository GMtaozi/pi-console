/**
 * Phase 2 Batch 2: Execution log cleanup cron job.
 * Runs daily at 03:00 to remove old execution logs,
 * keeping the most recent 100 executions per workflow.
 */

import { cleanupExecutionLogs } from '../engine/ExecutionLogger';

let cleanupTimer: NodeJS.Timeout | null = null;
let isRunning = false;

function msUntilNext3AM(): number {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 3, 0, 0, 0);
  if (target.getTime() <= now.getTime()) {
    // If it's already past 3 AM, schedule for tomorrow
    target.setDate(target.getDate() + 1);
  }
  return target.getTime() - now.getTime();
}

export function startCleanupCron(): void {
  if (cleanupTimer) return;
  isRunning = true;

  const scheduleNext = () => {
    if (!isRunning) return;
    const delay = msUntilNext3AM();
    cleanupTimer = setTimeout(async () => {
      if (!isRunning) return;
      try {
        const deleted = await cleanupExecutionLogs();
        console.log(`[Cleanup] Removed ${deleted} old execution log(s)`);
      } catch (err: any) {
        console.error('[Cleanup] Error:', err.message);
      }
      // Schedule next run only if still running
      if (isRunning) {
        scheduleNext();
      }
    }, delay);
  };

  scheduleNext();
  console.log('[Cleanup] Daily execution log cleanup scheduled for 03:00');
}

export function stopCleanupCron(): void {
  isRunning = false;
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }
}
