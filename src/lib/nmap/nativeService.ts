/**
 * NETSCOPE Native Nmap Service
 * Controlled local process execution using isolated argument vectors.
 * Strictly avoids shell interpolation and enforces process governance.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NmapStatus, ScanExecutionResult, ScanProcessState, ScanRequest } from '../../types/nmap';
import { buildNmapArgs } from './profiles';
import { validateTarget } from '../validation/targetValidator';

interface ActiveScanRecord {
  process: ChildProcess;
  scanId: string;
  target: string;
  startedAt: string;
  xmlPath: string;
  dirPath: string;
  status: ScanProcessState;
  error?: string;
  completedAt?: string;
  timeoutTimer?: NodeJS.Timeout;
}

const activeScans = new Map<string, ActiveScanRecord>();
const completedScans = new Map<string, ScanExecutionResult>();

// Known default paths for common platforms (especially Windows as primary dev environment)
const COMMON_NMAP_PATHS = [
  'C:\\Program Files\\Nmap\\nmap.exe',
  'C:\\Program Files (x86)\\Nmap\\nmap.exe',
  'C:\\ProgramData\\chocolatey\\bin\\nmap.exe',
  '/usr/bin/nmap',
  '/usr/local/bin/nmap',
  '/opt/homebrew/bin/nmap',
  'nmap',
  'nmap.exe',
];

/**
 * Checks if Nmap binary is available and retrieves version safely
 */
export async function detectNmap(configuredPath?: string): Promise<NmapStatus> {
  const candidatesToTry = configuredPath
    ? [configuredPath, ...COMMON_NMAP_PATHS]
    : COMMON_NMAP_PATHS;

  for (const candidate of candidatesToTry) {
    try {
      const res = await runNmapVersion(candidate);
      if (res.installed) {
        return res;
      }
    } catch {
      // try next
    }
  }

  return {
    installed: false,
    path: configuredPath || 'nmap',
    error: 'Nmap executable was not found. Install Nmap and configure its executable path in Settings.',
  };
}

function runNmapVersion(executablePath: string): Promise<NmapStatus> {
  return new Promise((resolve) => {
    try {
      // Direct spawn with argument vector, never shell interpolation
      const proc = spawn(executablePath, ['--version'], {
        shell: false,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        proc.kill();
        resolve({
          installed: false,
          path: executablePath,
          error: 'Version detection timed out.',
        });
      }, 3000);

      proc.on('error', (err) => {
        clearTimeout(timer);
        resolve({
          installed: false,
          path: executablePath,
          error: err.message,
        });
      });

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0 && stdout.toLowerCase().includes('nmap')) {
          const match = stdout.match(/Nmap version ([0-9a-zA-Z.]+)/i);
          resolve({
            installed: true,
            path: executablePath,
            version: match ? match[1] : 'Unknown version',
          });
        } else {
          resolve({
            installed: false,
            path: executablePath,
            error: stderr || `Process exited with code ${code}`,
          });
        }
      });
    } catch (e: any) {
      resolve({
        installed: false,
        path: executablePath,
        error: e.message || 'Execution failed',
      });
    }
  });
}

/**
 * Starts an authorized Nmap scan with isolated argument array
 */
export async function startNativeScan(
  nmapPath: string,
  request: ScanRequest
): Promise<{ scanId: string; error?: string }> {
  // 1. Strict Target Validation
  const validation = validateTarget(request.target);
  if (!validation.isValid || !validation.normalizedTarget) {
    return { scanId: '', error: validation.error || 'Invalid target format.' };
  }

  const scanId = `scan-${Date.now()}`;
  const startedAt = new Date().toISOString();

  // 2. Prepare isolated scan artifact directory
  const rootDataDir = path.resolve(process.cwd(), 'data', 'scans', scanId);
  try {
    fs.mkdirSync(rootDataDir, { recursive: true });
  } catch (err: any) {
    return { scanId: '', error: `Failed to create scan artifact directory: ${err.message}` };
  }

  const xmlPath = path.join(rootDataDir, 'result.xml');
  const metadataPath = path.join(rootDataDir, 'metadata.json');

  // Save initial metadata
  fs.writeFileSync(
    metadataPath,
    JSON.stringify(
      {
        scanId,
        target: validation.normalizedTarget,
        profile: request.profile,
        startedAt,
        status: 'initializing',
      },
      null,
      2
    )
  );

  // 3. Construct Safe Argument Array
  const args = buildNmapArgs({
    target: validation.normalizedTarget,
    profileId: request.profile,
    xmlOutputPath: xmlPath,
    customPorts: request.customPorts || request.watchlist,
  });

  try {
    // 4. Spawn child process (shell: false prevents command injection)
    const proc = spawn(nmapPath, args, {
      shell: false,
      windowsHide: true,
    });

    const timeoutSeconds = request.timeout && request.timeout > 0 ? request.timeout : 120;
    const timeoutTimer = setTimeout(() => {
      stopNativeScan(scanId, 'timeout');
    }, timeoutSeconds * 1000);

    const record: ActiveScanRecord = {
      process: proc,
      scanId,
      target: validation.normalizedTarget,
      startedAt,
      xmlPath,
      dirPath: rootDataDir,
      status: 'running',
      timeoutTimer,
    };

    activeScans.set(scanId, record);

    proc.on('error', (err) => {
      clearTimeout(timeoutTimer);
      record.status = 'failed';
      record.error = err.message;
      record.completedAt = new Date().toISOString();
      completedScans.set(scanId, {
        scanId,
        status: 'failed',
        startedAt,
        completedAt: record.completedAt,
        xmlPath,
        error: `Process spawn error: ${err.message}`,
      });
      activeScans.delete(scanId);
    });

    proc.on('close', (code) => {
      clearTimeout(timeoutTimer);
      if (record.status === 'stopped' || record.status === 'timeout') {
        // Handled by stopNativeScan
        return;
      }

      record.completedAt = new Date().toISOString();
      const status: ScanProcessState = code === 0 ? 'completed' : 'failed';
      record.status = status;

      let xmlContent = '';
      if (fs.existsSync(xmlPath)) {
        try {
          xmlContent = fs.readFileSync(xmlPath, 'utf8');
        } catch {
          // ignore
        }
      }

      const executionResult: ScanExecutionResult = {
        scanId,
        status,
        startedAt,
        completedAt: record.completedAt,
        xmlPath,
        xmlContent,
        error: code !== 0 ? `Nmap exited with code ${code}` : undefined,
      };

      completedScans.set(scanId, executionResult);
      activeScans.delete(scanId);

      // Update metadata.json
      try {
        fs.writeFileSync(
          metadataPath,
          JSON.stringify(
            {
              scanId,
              target: validation.normalizedTarget,
              profile: request.profile,
              startedAt,
              completedAt: record.completedAt,
              status,
              exitCode: code,
            },
            null,
            2
          )
        );
      } catch {
        // ignore
      }
    });

    return { scanId };
  } catch (err: any) {
    return { scanId: '', error: `Failed to launch Nmap process: ${err.message}` };
  }
}

/**
 * Stops an ongoing scan process safely
 */
export async function stopNativeScan(
  scanId: string,
  reason: 'stopped' | 'timeout' = 'stopped'
): Promise<{ success: boolean; error?: string }> {
  const record = activeScans.get(scanId);
  if (!record) {
    return { success: false, error: 'No active scan found with that ID.' };
  }

  if (record.timeoutTimer) {
    clearTimeout(record.timeoutTimer);
  }

  record.status = reason;
  record.completedAt = new Date().toISOString();
  record.error = reason === 'timeout' ? 'Scan exceeded allowable timeout threshold.' : 'Scan terminated by user.';

  try {
    record.process.kill('SIGTERM');
  } catch {
    try {
      record.process.kill();
    } catch {
      // process already dead
    }
  }

  let xmlContent = '';
  if (fs.existsSync(record.xmlPath)) {
    try {
      xmlContent = fs.readFileSync(record.xmlPath, 'utf8');
    } catch {
      // ignore
    }
  }

  completedScans.set(scanId, {
    scanId,
    status: reason,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    xmlPath: record.xmlPath,
    xmlContent,
    error: record.error,
  });

  activeScans.delete(scanId);
  return { success: true };
}

/**
 * Retrieves the real-time execution status of a scan
 */
export async function getNativeScanStatus(scanId: string): Promise<ScanExecutionResult | null> {
  const active = activeScans.get(scanId);
  if (active) {
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(active.startedAt).getTime()) / 1000
    );
    return {
      scanId,
      status: active.status,
      startedAt: active.startedAt,
      xmlPath: active.xmlPath,
      elapsedSeconds,
    };
  }

  const completed = completedScans.get(scanId);
  if (completed) {
    return completed;
  }

  return null;
}
