# NETSCOPE Architecture Specification

## 1. Architectural Philosophy

NETSCOPE is engineered as a **local-first, desktop-ready network reconnaissance and continuous assessment platform**. Its core goals are:

1. **Safety by Construction**: Target inputs are strictly validated; command execution operates via argument vectors rather than shell strings.
2. **Deterministic Baseline Drift**: Changes across time are calculated algorithmically by comparing normalized domain models rather than unstructured terminal text.
3. **Controlled Native Execution (Phase 2)**: The desktop layer manages local Nmap child processes with safe vectors, timeouts, and process cancellation.
4. **AI Air-Gapping**: Machine learning models (Gemini / DeepSeek) are provided structured, fact-grounded JSON payloads and have zero direct command execution authority.

---

## 2. Directory Structure

```
src/
├── types/
│   ├── index.ts                 # Normalized domain types (Host, Port, Scan, ScanChange, etc.)
│   └── nmap.ts                  # Native execution contracts (NmapStatus, ScanRequest, ScanExecutionResult)
├── lib/
│   ├── validation/
│   │   └── targetValidator.ts   # Input validation, CIDR checks, injection protection
│   ├── nmap/
│   │   ├── profiles.ts          # Predefined safe scan profiles and argv constructor
│   │   ├── watchlist.ts         # Monitored port definitions
│   │   └── nativeService.ts     # Native child_process execution, timeouts & termination
│   ├── parser/
│   │   ├── changeDetector.ts    # Deterministic baseline diff engine
│   │   ├── nmapXmlParser.ts     # Canonical Nmap XML parser (hosts & ports extractor)
│   │   └── sampleData.ts        # XML fixtures & mock datasets
│   ├── database/
│   │   ├── storageProvider.ts   # StorageProvider abstraction (MockStorage & SQLiteStorage)
│   │   └── mockStorage.ts       # Central state manager, inventory merger & scan dispatcher
│   └── ai/
│       ├── types.ts             # Structured AI payload builders & provider contracts
│       └── provider.ts          # Gemini & DeepSeek evidence-grounded providers
├── desktop/
│   └── bridge.ts                # Desktop runtime abstraction (Tauri IPC / Native Express Bridge)
├── components/
│   ├── layout/
│   │   ├── TopBar.tsx           # Status indicators (Local Mode, Nmap Status, DB, AI)
│   │   └── Sidebar.tsx          # Navigation controls
│   └── common/
│       ├── StatCard.tsx         # Clean metric card
│       └── Modal.tsx            # Accessible modal dialog
├── features/
│   ├── dashboard/               # High-level posture metrics & event streams
│   ├── scanner/                 # Target validation, profile selection, execution states & logs
│   ├── hosts/                   # Asset inventory & port/drift inspection
│   ├── ports/                   # Aggregated listener matrix & watchlist toggles
│   ├── monitoring/              # Continuous automated schedules
│   ├── history/                 # Historical scan records & visual side-by-side diff
│   ├── reports/                 # JSON, Markdown, CSV export & AI analysis trigger
│   └── settings/                # Binaries, database paths, and scope boundaries
server.ts                        # Local Express native bridge runner & Vite dev server
data/
└── scans/                       # Controlled scan artifact directory (<scan-id>/result.xml)
tests/
├── validation.test.ts
├── changeDetection.test.ts
├── profiles.test.ts
├── xmlParser.test.ts
├── nmapNative.test.ts
└── run-all.ts
```

---

## 3. Native Execution & Desktop Bridge

The communication path between the frontend and local Nmap binary enforces strict argument isolation:

```
[React Frontend]
       │
       ▼
[Desktop Bridge (src/desktop/bridge.ts)]
       │
  ┌────┴───────────────────────────┐
  ▼                                ▼
[Tauri IPC: window.__TAURI__]   [Local Native Bridge: /api/nmap/*]
  │                                │
  └─────────────────┬──────────────┘
                    ▼
       [Native Nmap Service (src/lib/nmap/nativeService.ts)]
                    │
                    ▼
       [child_process.spawn(nmapPath, args, { shell: false })]
                    │
                    ├──► Process timeout watchdog
                    ├──► STOP SCAN (SIGTERM/SIGINT)
                    ▼
       [data/scans/<scan-id>/result.xml]
                    │
                    ▼
       [Canonical XML Parser (src/lib/parser/nmapXmlParser.ts)]
                    │
                    ▼
       [Baseline Change Detector (src/lib/parser/changeDetector.ts)]
                    │
                    ▼
       [StorageProvider & UI State Update]
```

### Predefined Bridge Operations:
1. `getNmapStatus(configuredPath)`: Safely probes `--version` across Windows/POSIX default paths.
2. `startScan(request)`: Strictly validates target, builds argument vectors, starts background child process.
3. `stopScan(scanId)`: Signals process termination only for processes spawned by NETSCOPE.
4. `getScanStatus(scanId)`: Returns current execution state and captures XML buffer when complete.

---

## 4. Scan Lifecycle & Artifact Persistence

Scan records are written to an isolated directory structure:
```
data/
└── scans/
    └── <scan-id>/
        ├── metadata.json       # Target, profile, timestamps, exit codes
        └── result.xml          # Canonical Nmap XML output (-oX)
```

### Lifecycle States:
- `IDLE`: Awaiting operator command.
- `INITIALIZING`: Validating target format, verifying binary path, creating artifact directory.
- `RUNNING`: Isolated Nmap child process executing. Watchdog active.
- `PARSING`: Child process terminated; parsing XML artifact into normalized domain models.
- `COMPLETED`: Baseline delta computed, inventory updated, changes recorded.
- `STOPPED`: Operator clicked STOP SCAN; child process gracefully halted.
- `TIMEOUT`: Execution exceeded allowable threshold (default 120s); process aborted.
- `FAILED`: Nmap exited with error or invalid configuration.

---

## 5. Storage Provider Abstraction

Data storage is decoupled from the UI via the `StorageProvider` interface:

```
StorageProvider
├── MockStorageProvider     (localStorage / in-memory for testing & web preview)
└── SQLiteStorageProvider   (Local SQLite file ~/.netscope/netscope.db)
```

The database manages:
- `scans`: Historical records of scan metadata and durations.
- `hosts`: Inventory of discovered endpoints, hostnames, and MAC vendors.
- `ports`: Aggregated open port bindings, services, and software versions.
- `scan_changes`: Baseline drift events (`NEW_HOST`, `PORT_OPENED`, etc.).
- `monitoring_jobs`: Automated scheduled audit definitions.
- `port_watchlist`: Operator port watchlist items.
- `settings`: Platform configuration and paths.
