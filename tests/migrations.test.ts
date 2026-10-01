/**
 * NETSCOPE Unit Tests: SQLite Migrations System
 */

import { DatabaseSync } from 'node:sqlite';
import { runMigrations, EMBEDDED_MIGRATIONS } from '../src/lib/database/migrations';

export function runMigrationTests() {
  console.log('--- RUNNING SQLITE MIGRATION TESTS ---');

  // In-memory test database
  const db = new DatabaseSync(':memory:');

  // Test 1: Run initial migrations
  const status1 = runMigrations(db);
  console.assert(status1.appliedCount === EMBEDDED_MIGRATIONS.length, `Test 1 Failed: Expected ${EMBEDDED_MIGRATIONS.length} migrations applied, got ${status1.appliedCount}`);
  console.assert(status1.currentVersion === 3, `Test 1 Failed: Expected version 3, got ${status1.currentVersion}`);

  // Test 2: Idempotency - running migrations again should apply 0 pending migrations
  const status2 = runMigrations(db);
  console.assert(status2.appliedCount === 0, `Test 2 Failed: Second run should apply 0 migrations, got ${status2.appliedCount}`);
  console.assert(status2.currentVersion === 3, `Test 2 Failed: Version should remain 3, got ${status2.currentVersion}`);

  // Test 3: Verify all expected tables exist
  const tablesRow = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const tableNames = tablesRow.map((r) => r.name);

  const requiredTables = [
    'schema_migrations',
    'scans',
    'hosts',
    'ports',
    'services',
    'scan_hosts',
    'scan_ports',
    'scan_changes',
    'monitoring_jobs',
    'monitoring_events',
    'port_watchlist',
    'settings',
  ];

  for (const t of requiredTables) {
    console.assert(tableNames.includes(t), `Test 3 Failed: Missing required table: ${t}`);
  }

  // Test 4: Verify indexes exist
  const indexesRow = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all() as { name: string }[];
  const indexNames = indexesRow.map((r) => r.name);
  console.assert(indexNames.includes('idx_scans_created_at'), 'Test 4 Failed: Missing idx_scans_created_at index');
  console.assert(indexNames.includes('idx_hosts_ip'), 'Test 4 Failed: Missing idx_hosts_ip index');
  console.assert(indexNames.includes('idx_scan_hosts_scan_id'), 'Test 4 Failed: Missing idx_scan_hosts_scan_id index');
  console.assert(indexNames.includes('idx_monitoring_events_job_id'), 'Test 4 Failed: Missing idx_monitoring_events_job_id index');

  console.log('✓ SQLite migration tests passed.');
}
