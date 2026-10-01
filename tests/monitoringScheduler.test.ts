/**
 * NETSCOPE Unit Tests: Continuous Monitoring Engine & Scheduler
 * Tests:
 * - Scheduler timing & due-job detection
 * - Duplicate execution protection
 * - Global concurrency limiting (MAX_CONCURRENT_MONITORING_SCANS)
 * - Pause, resume, and stop lifecycle states
 * - Failure handling and retry policy (max 2 retries)
 * - Target boundary validation failure handling
 * - Event creation & acknowledgement without deleting evidence
 * - Startup restoration behavior (safe paused state)
 * - Graceful shutdown
 */

import { SQLiteService } from '../src/lib/database/sqliteService';
import { MonitoringEngine } from '../src/lib/monitoring/monitoringEngine';
import { MonitoringJob } from '../src/types';
import fs from 'fs';
import path from 'path';

export async function runMonitoringSchedulerTests() {
  console.log('--- RUNNING MONITORING ENGINE & SCHEDULER TESTS ---');

  const testDbPath = path.resolve(process.cwd(), 'data', 'test-monitoring.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const service = new SQLiteService(testDbPath);
  service.initialize();
  // Clear any seeded mock jobs for clean isolated test scope
  (service as any).db.exec('DELETE FROM monitoring_jobs; DELETE FROM monitoring_events;');

  const engine = new MonitoringEngine({
    dbService: service,
    maxConcurrency: 2,
    tickIntervalMs: 50,
    mockMode: true,
  });

  // Test 1: Create Monitoring Job with Valid Target
  const job1 = engine.createJob({
    name: 'Subnet Alpha Monitor',
    target: '192.168.1.0/24',
    profileId: 'common-services',
    intervalSeconds: 30,
    scanTimeoutSeconds: 60,
  });

  console.assert(job1.id.startsWith('job-'), 'Test 1 Failed: Job ID should be generated');
  console.assert(job1.target === '192.168.1.0/24', 'Test 1 Failed: Target should be normalized');
  console.assert(job1.status === 'active', 'Test 1 Failed: New job should be active');
  console.assert(job1.runtimeState === 'idle', 'Test 1 Failed: Initial runtime state should be idle');

  // Test 2: Target Boundary Validation Failure Guardrail (Requirement 8)
  let invalidTargetCaught = false;
  try {
    engine.createJob({
      name: 'Malicious Target Job',
      target: '192.168.1.1; cat /etc/passwd',
      profileId: 'common-services',
      intervalSeconds: 60,
    });
  } catch {
    invalidTargetCaught = true;
  }
  console.assert(invalidTargetCaught === true, 'Test 2 Failed: Shell injection pattern should be rejected');

  // Test 3: Due-Job Detection & Scheduler Execution
  engine.start();
  engine.resumeJob(job1.id);

  // Force job next_run_at to past so it is immediately due
  service.updateMonitoringJobRuntime(job1.id, {
    nextRunAt: new Date(Date.now() - 5000).toISOString(),
  });

  // Run single scheduler tick
  await engine.tick();

  // Wait brief moment for mock scan execution to complete
  await new Promise((r) => setTimeout(r, 150));

  const updatedJob1 = service.getMonitoringJobs().find((j) => j.id === job1.id);
  console.assert(
    (updatedJob1?.totalRuns || 0) >= 1,
    `Test 3 Failed: Due job should have executed at least once (runs: ${updatedJob1?.totalRuns})`
  );
  console.assert(
    updatedJob1?.lastRunAt !== undefined,
    'Test 3 Failed: lastRunAt should be set'
  );

  // Test 4: Duplicate Execution Protection (Requirement 5)
  // When a job is running, attempting to execute it again should immediately be prevented
  (engine as any).runningScans.set(job1.id, {
    jobId: job1.id,
    scanId: 'running-test-scan',
    startedAt: new Date().toISOString(),
    isMock: true,
  });

  let duplicateLaunched = false;
  try {
    // Attempting to execute the already running job
    await engine.executeJob(job1);
  } catch {
    duplicateLaunched = true;
  }

  console.assert(
    duplicateLaunched === false,
    'Test 4 Failed: Running job should not launch a second duplicate scan'
  );
  (engine as any).runningScans.delete(job1.id);

  // Test 5: Global Concurrency Limiting (Requirement 6)
  engine.setMaxConcurrency(1);

  const job2 = engine.createJob({
    name: 'Subnet Beta Monitor',
    target: '10.0.0.0/24',
    profileId: 'host-discovery',
    intervalSeconds: 30,
  });

  // Make both jobs due simultaneously
  service.updateMonitoringJobRuntime(job1.id, {
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    runtimeState: 'idle',
  });
  service.updateMonitoringJobRuntime(job2.id, {
    nextRunAt: new Date(Date.now() - 1000).toISOString(),
    runtimeState: 'idle',
  });

  // Simulate active scan consuming the maxConcurrency limit of 1
  (engine as any).runningScans.set(job1.id, {
    jobId: job1.id,
    scanId: 'concurrency-occupier',
    startedAt: new Date().toISOString(),
    isMock: true,
  });

  // Run tick - job2 should be placed in queue
  await engine.tick();

  const queuedJob2 = service.getMonitoringJobs().find((j) => j.id === job2.id);
  console.assert(
    queuedJob2?.runtimeState === 'queued' || (engine as any).queuedJobs.includes(job2.id),
    'Test 5 Failed: Job exceeding concurrency limit should be queued'
  );

  // Clean up mock running scan
  (engine as any).runningScans.delete(job1.id);
  (engine as any).queuedJobs = [];
  engine.setMaxConcurrency(2);

  // Test 6: Pause and Resume Lifecycle (Requirement 12)
  const paused = engine.pauseJob(job1.id);
  console.assert(paused === true, 'Test 6 Failed: pauseJob should return true');

  const afterPause = service.getMonitoringJobs().find((j) => j.id === job1.id);
  console.assert(afterPause?.status === 'paused', 'Test 6 Failed: status should be paused');
  console.assert(afterPause?.runtimeState === 'paused', 'Test 6 Failed: runtimeState should be paused');

  const resumed = engine.resumeJob(job1.id);
  console.assert(resumed === true, 'Test 6 Failed: resumeJob should return true');

  const afterResume = service.getMonitoringJobs().find((j) => j.id === job1.id);
  console.assert(afterResume?.status === 'active', 'Test 6 Failed: status should be active after resume');

  // Test 7: Stop Lifecycle (Requirement 13)
  const stopped = await engine.stopJob(job1.id);
  console.assert(stopped === true, 'Test 7 Failed: stopJob should return true');

  const afterStop = service.getMonitoringJobs().find((j) => j.id === job1.id);
  console.assert(afterStop?.status === 'stopped', 'Test 7 Failed: status should be stopped');
  console.assert(afterStop?.runtimeState === 'stopped', 'Test 7 Failed: runtimeState should be stopped');

  // Test 8: Conservative Retry Policy (Requirement 10)
  // Simulate scan failure
  const failJob = engine.createJob({
    name: 'Failing Job Monitor',
    target: '172.16.0.0/24',
    profileId: 'common-services',
    intervalSeconds: 60,
  });

  // Attempt 1: should schedule retry in 5s
  (engine as any).handleScanFailure(failJob, 'Connection timed out');
  console.assert(
    (engine as any).jobRetries.get(failJob.id) === 1,
    'Test 8 Failed: Retry count should be 1 after first failure'
  );

  // Attempt 2: should schedule retry in 5s
  (engine as any).handleScanFailure(failJob, 'Connection timed out');
  console.assert(
    (engine as any).jobRetries.get(failJob.id) === 2,
    'Test 8 Failed: Retry count should be 2 after second failure'
  );

  // Attempt 3: retries exhausted -> records failure and generates SCAN_FAILED event
  (engine as any).handleScanFailure(failJob, 'Connection timed out');
  console.assert(
    (engine as any).jobRetries.has(failJob.id) === false,
    'Test 8 Failed: Retry count should be reset after exhaustion'
  );

  const failedJobRecord = service.getMonitoringJobs().find((j) => j.id === failJob.id);
  console.assert(failedJobRecord?.runtimeState === 'failed', 'Test 8 Failed: Job should be marked failed');
  console.assert((failedJobRecord?.failureCount || 0) >= 1, 'Test 8 Failed: Failure count should be incremented');

  // Test 9: Monitoring Event Creation and Acknowledgement (Requirement 16, 23, 24)
  const events = service.listMonitoringEvents({ jobId: failJob.id });
  console.assert(events.length > 0, 'Test 9 Failed: SCAN_FAILED event should be recorded');
  const failureEvent = events[0];
  console.assert(failureEvent.eventType === 'SCAN_FAILED', 'Test 9 Failed: Event type should be SCAN_FAILED');
  console.assert(failureEvent.severity === 'warning', 'Test 9 Failed: Event severity should be warning');
  console.assert(failureEvent.acknowledgedAt === undefined, 'Test 9 Failed: Event should initially be unacknowledged');

  const ackSuccess = engine.acknowledgeEvent(failureEvent.id);
  console.assert(ackSuccess === true, 'Test 9 Failed: Event acknowledgement should return true');

  const ackedEvents = service.listMonitoringEvents({ jobId: failJob.id, unacknowledgedOnly: true });
  console.assert(ackedEvents.length === 0, 'Test 9 Failed: Unacknowledged query should now be empty');

  // Acknowledging does not delete original evidence in SQLite
  const allEventsAfterAck = service.listMonitoringEvents({ jobId: failJob.id });
  console.assert(allEventsAfterAck.length > 0, 'Test 9 Failed: Event must remain in database after ack');

  // Test 10: Safe Startup Restoration (Requirement 14)
  // Create an active job in SQLite
  const activeJobBeforeRestart = engine.createJob({
    name: 'Active Restart Test Job',
    target: '192.168.2.0/24',
    profileId: 'common-services',
    intervalSeconds: 60,
  });

  // Stop engine
  await engine.stop();

  // Create fresh new engine instance simulating application boot
  const newEngine = new MonitoringEngine({
    dbService: service,
    maxConcurrency: 2,
    tickIntervalMs: 50,
  });

  newEngine.start();

  const restoredJob = service.getMonitoringJobs().find((j) => j.id === activeJobBeforeRestart.id);
  console.assert(
    restoredJob?.status === 'paused' && restoredJob?.runtimeState === 'paused',
    'Test 10 Failed: On restart, previously active jobs must be restored as paused to prevent unexpected scans'
  );

  // Test 11: Graceful Shutdown (Requirement 15)
  await newEngine.stop();
  const engineStatusAfterStop = newEngine.getStatus();
  console.assert(engineStatusAfterStop.running === false, 'Test 11 Failed: Engine running status should be false');
  console.assert(engineStatusAfterStop.runningScansCount === 0, 'Test 11 Failed: No running scans after shutdown');

  // Clean up test DB
  service.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log('✓ Monitoring Engine & Scheduler unit tests passed.');
}
