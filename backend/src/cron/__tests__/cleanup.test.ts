import { describe, it } from 'node:test';
import assert from 'node:assert';
import { startCleanupCron, stopCleanupCron } from '../cleanup';

describe('Cleanup Cron', () => {
  it('starts and stops without error', () => {
    assert.doesNotThrow(() => {
      startCleanupCron();
    });
    assert.doesNotThrow(() => {
      stopCleanupCron();
    });
  });

  it('can be restarted after stopping', () => {
    startCleanupCron();
    stopCleanupCron();
    assert.doesNotThrow(() => {
      startCleanupCron();
    });
    stopCleanupCron();
  });
});
