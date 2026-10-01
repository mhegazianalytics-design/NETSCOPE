import { runValidationTests } from './validation.test';
import { runChangeDetectionTests } from './changeDetection.test';
import { runProfileTests } from './profiles.test';
import { runXmlParserTests } from './xmlParser.test';
import { runNmapNativeTests } from './nmapNative.test';
import { runMigrationTests } from './migrations.test';
import { runDatabaseIngestionTests } from './databaseIngestion.test';
import { runDataIntegrityTest } from './dataIntegrity.test';
import { runMonitoringSchedulerTests } from './monitoringScheduler.test';
import { runMonitoringIntegrationTest } from './monitoringIntegration.test';

console.log('====================================================');
console.log('     NETSCOPE AUTOMATED UNIT TEST RUNNER (PHASE 4)    ');
console.log('====================================================\n');

async function runAll() {
  try {
    runValidationTests();
    console.log('');
    runChangeDetectionTests();
    console.log('');
    runProfileTests();
    console.log('');
    runXmlParserTests();
    console.log('');
    runNmapNativeTests();
    console.log('');
    runMigrationTests();
    console.log('');
    runDatabaseIngestionTests();
    console.log('');
    runDataIntegrityTest();
    console.log('');
    await runMonitoringSchedulerTests();
    console.log('');
    await runMonitoringIntegrationTest();
    console.log('\n====================================================');
    console.log('     ALL TEST SUITES PASSED VERIFICATION (100%)       ');
    console.log('====================================================');
  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    process.exit(1);
  }
}

runAll();
