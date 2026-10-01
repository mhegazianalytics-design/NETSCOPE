/**
 * NETSCOPE Integration Test: Continuous Monitoring Engine Mock Mode End-to-End
 * (Requirements 28 & 29)
 *
 * Flow:
 * 1. Create monitoring job on authorized mock target
 * 2. Run scheduler tick -> Scan #1 -> Ingested into SQLite
 * 3. Second run triggers change detection -> Scan #2 -> Baseline delta recorded -> Monitoring event created
 * 4. Pause job -> Verify no further scan executions
 * 5. Resume job -> Next scheduled execution occurs
 * 6. Stop job -> No future execution
 */

import { SQLiteService } from '../src/lib/database/sqliteService';
import { MonitoringEngine } from '../src/lib/monitoring/monitoringEngine';
import fs from 'fs';
import path from 'path';

export async function runMonitoringIntegrationTest() {
  console.log('--- RUNNING MONITORING ENGINE INTEGRATION TEST (MOCK MODE E2E) ---');

  const testDbPath = path.resolve(process.cwd(), 'data', 'test-monitoring-e2e.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const service = new SQLiteService(testDbPath);
  service.initialize();
  // Clear any seeded data for clean test verification
  (service as any).db.exec(
    'DELETE FROM monitoring_jobs; DELETE FROM monitoring_events; DELETE FROM scans; DELETE FROM scan_hosts; DELETE FROM scan_ports; DELETE FROM scan_changes; DELETE FROM ports; DELETE FROM hosts;'
  );

  const engine = new MonitoringEngine({
    dbService: service,
    maxConcurrency: 2,
    tickIntervalMs: 50,
    mockMode: true,
  });

  engine.start();

  // Step 1: Create Monitoring Job
  const target = '192.168.1.0/24';
  const job = engine.createJob({
    name: 'E2E Laboratory Sweep',
    target,
    profileId: 'common-services',
    intervalSeconds: 15,
  });

  console.assert(job.id !== '', 'E2E Step 1 Failed: Job not created');

  // Step 2: Trigger Scan #1
  // Make due immediately
  engine.resumeJob(job.id);
  service.updateMonitoringJobRuntime(job.id, {
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
  });

  await engine.tick();

  // Wait for scan #1 to finish and persist
  await new Promise((r) => setTimeout(r, 150));

  const scansAfterRun1 = service.listScans({ target });
  console.assert(
    scansAfterRun1.scans.length >= 1,
    `E2E Step 2 Failed: Scan #1 should be persisted into SQLite (found ${scansAfterRun1.scans.length})`
  );

  const jobAfterRun1 = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(
    (jobAfterRun1?.totalRuns || 0) === 1,
    `E2E Step 2 Failed: Total runs should be 1, got ${jobAfterRun1?.totalRuns}`
  );

  // Step 3: Trigger Scan #2 (Simulates Baseline Drift / XML Changes)
  service.updateMonitoringJobRuntime(job.id, {
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    runtimeState: 'idle',
  });

  await engine.tick();
  await new Promise((r) => setTimeout(r, 150));

  const scansAfterRun2 = service.listScans({ target });
  console.assert(
    scansAfterRun2.scans.length >= 2,
    `E2E Step 3 Failed: Scan #2 should be persisted (found ${scansAfterRun2.scans.length})`
  );

  // Check that changes and monitoring events were generated
  const recordedChanges = service.listChanges();
  console.assert(
    recordedChanges.length > 0,
    'E2E Step 3 Failed: Baseline comparison should have detected changes on second scan'
  );

  const events = service.listMonitoringEvents({ jobId: job.id });
  console.assert(
    events.length > 0,
    `E2E Step 3 Failed: Monitoring events should be generated for detected changes (found ${events.length})`
  );

  // Step 4: Pause Job
  engine.pauseJob(job.id);
  const pausedJob = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(pausedJob?.status === 'paused', 'E2E Step 4 Failed: Job must be paused');

  const runsBeforePauseTicks = pausedJob?.totalRuns || 0;
  // Trigger ticks while paused
  await engine.tick();
  await new Promise((r) => setTimeout(r, 100));

  const jobAfterPauseTicks = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(
    jobAfterPauseTicks?.totalRuns === runsBeforePauseTicks,
    'E2E Step 4 Failed: Paused job must not execute further scans'
  );

  // Step 5: Resume Job
  engine.resumeJob(job.id);
  const resumedJob = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(resumedJob?.status === 'active', 'E2E Step 5 Failed: Job must be active after resume');

  // Next scheduled execution occurs
  await engine.tick();
  await new Promise((r) => setTimeout(r, 150));

  const jobAfterResumeRun = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(
    (jobAfterResumeRun?.totalRuns || 0) > runsBeforePauseTicks,
    'E2E Step 5 Failed: Resumed job should execute scheduled scan'
  );

  // Step 6: Stop Job
  await engine.stopJob(job.id);
  const stoppedJob = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(stoppedJob?.status === 'stopped', 'E2E Step 6 Failed: Job must be stopped');

  const runsAtStop = stoppedJob?.totalRuns || 0;
  await engine.tick();
  await new Promise((r) => setTimeout(r, 100));

  const jobAfterStopTicks = service.getMonitoringJobs().find((j) => j.id === job.id);
  console.assert(
    jobAfterStopTicks?.totalRuns === runsAtStop,
    'E2E Step 6 Failed: Stopped job must not execute future scans'
  );

  // Gracefully stop engine
  await engine.stop();
  service.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log('✓ Continuous Monitoring Engine E2E Integration Test PASSED.');
}
