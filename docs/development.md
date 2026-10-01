# NETSCOPE Development Guide

## 1. Getting Started

### Prerequisites
- Node.js 18+ or Bun
- TypeScript 5+
- (Optional for Real Scans) Nmap 7.80+ installed locally

### Installation & Run
```bash
# Install dependencies
npm install

# Start full-stack development server (Express native runner + Vite HMR)
npm run dev

# Run automated test suites (Validation, Change Detection, Argument Construction, XML Parser, Process Lifecycle)
npm run test

# Type check
npm run lint

# Production build
npm run build
```

---

## 2. Mock Mode vs Native Execution

NETSCOPE provides two fully-supported operational modes:

### A. Real Nmap Mode (`mockMode = false`)
- Selected in **Settings → Execution Mode → Real Nmap**.
- The backend / desktop bridge invokes the local Nmap executable with isolated argument vectors (`spawn(nmapPath, args, { shell: false })`).
- Telemetry states (`INITIALIZING`, `RUNNING`, `PARSING`, `COMPLETED`, `STOPPED`, `TIMEOUT`) update in real time.
- Clicking **STOP SCAN** sends `SIGTERM` directly to the active process.
- XML results are saved under `data/scans/<scan-id>/result.xml` and parsed into normalized models.

### B. Mock Mode (`mockMode = true`)
- Selected in **Settings → Execution Mode → Mock Mode**.
- Safe simulation for offline development or workstations without Nmap installed.
- Ingests real Nmap XML fixtures (`sample-basic.xml` and `sample-changes.xml`) through the canonical XML parser.
- Deterministic baseline change detection verifies new ports, closed listeners, and service updates.

---

## 3. Implementation Roadmap

### Phase 1 (Completed & Verified)
- [x] Project scaffold and modular structure
- [x] Desktop-ready dark network-engineering UI
- [x] Universal TopBar with mode, Nmap, and database indicators
- [x] Dashboard, Scanner, Hosts, Ports, Monitoring, History, Reports, and Settings pages
- [x] Strict target validation and shell injection prevention
- [x] Deterministic baseline comparison engine
- [x] Port watchlist management
- [x] Air-gapped AI provider abstraction (Gemini & DeepSeek)
- [x] Unit test suite covering validation, change detection, and argument construction
- [x] Complete architecture, security, and developer documentation

### Phase 2 (Completed & Verified)
- [x] Native child process execution via desktop bridge / Express backend (`server.ts`)
- [x] Strict argument vector isolation (`spawn(nmapPath, args, { shell: false })`)
- [x] Canonical Nmap XML output parser (`src/lib/parser/nmapXmlParser.ts`)
- [x] Process lifecycle state management (`IDLE`, `INITIALIZING`, `RUNNING`, `PARSING`, `COMPLETED`, `STOPPED`, `TIMEOUT`)
- [x] Safe `STOP SCAN` process termination
- [x] Execution watchdog timeouts (default 120s)
- [x] Windows common installation path auto-detection
- [x] Dual execution mode selector: Mock vs Real Nmap
- [x] Scan artifact directory management (`data/scans/<scan-id>/`)
- [x] StorageProvider abstraction (`MockStorage` & `SQLiteStorage`)
- [x] Extended unit tests for XML parsing and process lifecycle

### Phase 3 (Upcoming)
- Native SQLite database persistence & migrations
- Historical scan indexing and database vacuuming

### Phase 4
- Advanced continuous monitoring cron triggers & background daemon
- Automated local desktop notifications on baseline drift

### Phase 5
- Full Gemini & DeepSeek API calling via secure OS keyring
- Live executive summary generation

### Phase 6
- PDF / HTML report exports
- Final packaging for Windows (`.msi` / `.exe`), Linux (`.deb` / `.AppImage`), and macOS (`.dmg`)
