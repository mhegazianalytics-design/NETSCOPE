/**
 * NETSCOPE Local Desktop Server
 * Hosts the native execution bridge, SQLite database API, and static/Vite front-end.
 * Strictly exposes only predefined Nmap and database operations.
 * No arbitrary shell execution or arbitrary SQL execution is permitted.
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import { detectNmap, getNativeScanStatus, startNativeScan, stopNativeScan } from './src/lib/nmap/nativeService';
import { sqliteService } from './src/lib/database/sqliteService';
import { ScanIngestionService } from './src/lib/database/scanIngestionService';
import { parseNmapXml } from './src/lib/parser/nmapXmlParser';
import { monitoringEngine } from './src/lib/monitoring/monitoringEngine';

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

async function bootstrap() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Ensure data/scans directory exists
  const dataDir = path.resolve(process.cwd(), 'data', 'scans');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // ignore
  }

  // Initialize SQLite database & migrations
  const dbInit = sqliteService.initialize();
  console.log(`[NETSCOPE] SQLite Database initialized at ${dbInit.path} (Schema v${dbInit.migrationStatus.currentVersion})`);

  // Initialize Monitoring Engine
  const settings = sqliteService.getSettings();
  if (settings) {
    monitoringEngine.setMockMode(settings.mockMode ?? true);
    if (settings.maxScanConcurrency) {
      monitoringEngine.setMaxConcurrency(settings.maxScanConcurrency);
    }
  }
  monitoringEngine.start();

  // --- SQLITE DATABASE API ROUTES ---

  // 1. Database Status
  app.get('/api/db/status', (_req, res) => {
    try {
      res.json({
        connected: true,
        engine: 'SQLite (Native DatabaseSync)',
        path: sqliteService.getDbPath(),
        schemaVersion: dbInit.migrationStatus.currentVersion,
        tablesCount: 10,
      });
    } catch (err: any) {
      res.status(500).json({ connected: false, error: err.message });
    }
  });

  // 2. Dashboard Metrics
  app.get('/api/db/dashboard', (_req, res) => {
    try {
      const metrics = sqliteService.getDashboardMetrics();
      res.json(metrics);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. List Scans (with search, filter, and pagination)
  app.get('/api/db/scans', (req, res) => {
    try {
      const { search, status, target, limit, offset } = req.query;
      const result = sqliteService.listScans({
        search: search as string | undefined,
        status: status as string | undefined,
        target: target as string | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Scan Details (immutable historical observations)
  app.get('/api/db/scans/:id', (req, res) => {
    try {
      const details = sqliteService.getScanDetails(req.params.id);
      if (!details) {
        return res.status(404).json({ error: 'Scan record not found' });
      }
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. List Hosts
  app.get('/api/db/hosts', (_req, res) => {
    try {
      const hosts = sqliteService.listHosts();
      res.json(hosts);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Host Details
  app.get('/api/db/hosts/:id', (req, res) => {
    try {
      const details = sqliteService.getHostDetails(req.params.id);
      if (!details) {
        return res.status(404).json({ error: 'Host not found' });
      }
      res.json(details);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. List Ports
  app.get('/api/db/ports', (_req, res) => {
    try {
      const ports = sqliteService.listPorts();
      res.json(ports);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. List Changes
  app.get('/api/db/changes', (req, res) => {
    try {
      const scanId = req.query.scanId as string | undefined;
      const changes = sqliteService.listChanges(scanId);
      res.json(changes);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 9. Monitoring Jobs & Engine
  app.get('/api/monitoring/status', (_req, res) => {
    try {
      res.json(monitoringEngine.getStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/monitoring/jobs', (_req, res) => {
    try {
      const jobs = sqliteService.getMonitoringJobs();
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/jobs', (req, res) => {
    try {
      const job = monitoringEngine.createJob(req.body);
      res.json(job);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/jobs/:id/pause', (req, res) => {
    try {
      const success = monitoringEngine.pauseJob(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/jobs/:id/resume', (req, res) => {
    try {
      const success = monitoringEngine.resumeJob(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/jobs/:id/stop', async (req, res) => {
    try {
      const success = await monitoringEngine.stopJob(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/monitoring/jobs/:id', async (req, res) => {
    try {
      const success = await monitoringEngine.deleteJob(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Monitoring Events
  app.get('/api/monitoring/events', (req, res) => {
    try {
      const { jobId, unacknowledgedOnly, limit } = req.query;
      const events = monitoringEngine.listEvents({
        jobId: jobId as string | undefined,
        unacknowledgedOnly: unacknowledgedOnly === 'true',
        limit: limit ? parseInt(limit as string, 10) : 50,
      });
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/events/:id/ack', (req, res) => {
    try {
      const success = monitoringEngine.acknowledgeEvent(req.params.id);
      res.json({ success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/monitoring/events/ack-all', (_req, res) => {
    try {
      const count = monitoringEngine.acknowledgeAllEvents();
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Backwards compatibility alias for existing /api/db/monitoring
  app.get('/api/db/monitoring', (_req, res) => {
    try {
      const jobs = sqliteService.getMonitoringJobs();
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/db/monitoring', (req, res) => {
    try {
      const job = monitoringEngine.createJob(req.body);
      res.json(job);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/db/monitoring/:id', async (req, res) => {
    try {
      await monitoringEngine.deleteJob(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Port Watchlist
  app.get('/api/db/watchlist', (_req, res) => {
    try {
      const watchlist = sqliteService.getWatchlist();
      res.json(watchlist);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/db/watchlist', (req, res) => {
    try {
      const item = sqliteService.upsertWatchlist(req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 11. Atomic Scan Ingestion (converges both Mock and Native Nmap scans into SQLite)
  app.post('/api/db/scan/ingest', (req, res) => {
    try {
      const { scan, hosts, ports, executionMode, xmlArtifactPath } = req.body;
      if (!scan || !hosts || !ports) {
        return res.status(400).json({ error: 'Missing required scan, hosts, or ports in payload.' });
      }

      const result = ScanIngestionService.persistScan({
        scan,
        hosts,
        ports,
        executionMode: executionMode || 'mock',
        xmlArtifactPath,
      });

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to ingest scan atomically.' });
    }
  });

  // 12. Database Backup & Reset
  app.get('/api/db/backup', (_req, res) => {
    try {
      const backupPath = sqliteService.backupDatabase();
      res.download(backupPath);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/db/reset', (req, res) => {
    try {
      const { confirm } = req.body;
      if (confirm !== 'RESET_CONFIRM') {
        return res.status(400).json({ error: 'Explicit confirmation string required.' });
      }
      sqliteService.resetDatabase();
      res.json({ success: true, message: 'Database reset to initial schema and sample baseline data.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- NATIVE NMAP API ROUTES ---

  // 1. Get Nmap Status & Version
  app.get('/api/nmap/status', async (req, res) => {
    try {
      const configuredPath = req.query.path as string | undefined;
      const status = await detectNmap(configuredPath);
      res.json(status);
    } catch (err: any) {
      res.status(500).json({
        installed: false,
        path: 'nmap',
        error: err.message || 'Failed to detect Nmap status',
      });
    }
  });

  // 2. Start Controlled Nmap Scan
  app.post('/api/nmap/scan', async (req, res) => {
    try {
      const { request, nmapPath } = req.body;
      if (!request || !request.target || !request.profile) {
        return res.status(400).json({ error: 'Missing required target or profile in scan request.' });
      }

      // Check nmap installed before executing
      const status = await detectNmap(nmapPath);
      if (!status.installed) {
        return res.status(400).json({
          error: `Nmap executable was not found at "${status.path}". Configure valid path in Settings or enable Mock Mode.`,
        });
      }

      const launchResult = await startNativeScan(status.path, request);
      if (launchResult.error) {
        return res.status(400).json({ error: launchResult.error });
      }

      res.json({ scanId: launchResult.scanId });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to launch native scan.' });
    }
  });

  // 3. Stop Active Scan
  app.post('/api/nmap/stop', async (req, res) => {
    try {
      const { scanId } = req.body;
      if (!scanId) {
        return res.status(400).json({ error: 'Missing scanId parameter.' });
      }
      const result = await stopNativeScan(scanId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 4. Get Scan Status & XML Artifact (auto-ingests on completion)
  app.get('/api/nmap/scan/:id', async (req, res) => {
    try {
      const scanId = req.params.id;
      const status = await getNativeScanStatus(scanId);
      if (!status) {
        return res.status(404).json({ error: 'Scan record not found.' });
      }

      // When native scan completes, automatically ingest it into SQLite if XML is present
      if (status.status === 'completed' && status.xmlContent) {
        try {
          const parsed = parseNmapXml(status.xmlContent);
          const scanRecord = {
            id: scanId,
            target: parsed.args ? parsed.args.split(' ').pop() || 'unknown' : 'target',
            profileId: 'common-services' as any,
            profileName: 'Native Nmap Scan',
            startedAt: status.startedAt,
            completedAt: status.completedAt,
            durationSeconds: status.elapsedSeconds,
            status: 'completed' as any,
            hostsDiscovered: parsed.hosts.length,
            openPortsDiscovered: parsed.ports.filter((p) => p.state === 'open').length,
            changesDetected: 0,
            rawOutputPath: status.xmlPath,
          };

          ScanIngestionService.persistScan({
            scan: scanRecord,
            hosts: parsed.hosts,
            ports: parsed.ports,
            executionMode: 'native',
            xmlArtifactPath: status.xmlPath,
          });
        } catch (ingestErr) {
          console.error('[NETSCOPE] Error auto-ingesting native scan:', ingestErr);
        }
      }

      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- VITE MIDDLEWARE / STATIC FILES ---
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        port: PORT,
        host: '0.0.0.0',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[NETSCOPE] Native desktop server listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[NETSCOPE] Shutting down gracefully...');
    await monitoringEngine.stop();
    sqliteService.close();
    server.close(() => {
      console.log('[NETSCOPE] Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[NETSCOPE] Fatal startup error:', err);
  process.exit(1);
});
