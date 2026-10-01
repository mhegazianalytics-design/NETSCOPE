# NETSCOPE
### Local Network Reconnaissance & Continuous Assessment Platform

NETSCOPE is a local desktop application designed for authorized network security assessments, inventory auditing, baseline drift detection, and continuous host/port monitoring.

---

## 1. What NETSCOPE Does

- **Controlled Network Reconnaissance**: Runs structured, safe Nmap scans strictly against authorized targets (single IPs, RFC 1918 subnets, or hostnames).
- **Native Local Execution (Phase 2)**: Executes the local Nmap binary via isolated argument vectors without shell expansion (`child_process.spawn`).
- **Machine-Readable Parsing**: Ingests Nmap XML artifacts directly into a normalized domain model.
- **Continuous Monitoring Engine (Phase 4)**: Centralized, autonomous local scheduler executing authorized Nmap sweeps, persisting observations into SQLite, and streaming change events.
- **Baseline Comparison & Drift Detection**: Compares new scan runs against historical baselines to flag:
  - `NEW_HOST` (newly discovered endpoints)
  - `REMOVED_HOST` (endpoints that have gone offline)
  - `PORT_OPENED` (new listening sockets)
  - `PORT_CLOSED` (closed listeners)
  - `SERVICE_CHANGED` (protocol changes)
  - `VERSION_CHANGED` (software version changes)
- **Monitoring Events & Alerts**: Change notices with strict non-vulnerability severity tiers (`INFO`, `NOTICE`, `WARNING`) and in-app acknowledgement without deleting SQLite evidence.
- **Structured AI Preparation**: Prepares evidence-grounded, schema-verified JSON payloads for Google Gemini and DeepSeek models without giving LLMs direct shell access.

---

## 2. Important Security Boundaries

NETSCOPE enforces strict defensive boundaries. It is intended **strictly for networks and systems that the operator owns or has explicit written authorization to assess**.

**NETSCOPE explicitly prohibits and does NOT implement:**
* Credential theft, harvesting, or brute-forcing
* Phishing or social engineering tooling
* Malware delivery, persistence, or rootkits
* Exploitation of vulnerabilities or payload generation
* Firewall, IDS, or NAT evasion
* Arbitrary shell execution from AI suggestions

**The AI layer is strictly air-gapped**: AI models only receive structured JSON summaries of verified scan facts. An AI model can never invoke shell commands or execute network probes directly.

---

## 3. Architecture Overview

```
                      +-----------------------------+
                      |      Operator UI (React)    |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               |                                           |
+--------------v---------------+             +-------------v---------------+
|  Target Validation & Scope   |             |   State & Persistence       |
|  - RFC 1123 / CIDR checks    |             |   - StorageProvider Abstraction |
|  - Metacharacter rejection   |             |   - Baseline comparisons        |
+--------------+---------------+             +-------------+---------------+
               |                                           |
+--------------v---------------+                           |
|  Safe Argument Constructor   |                           |
|  - Predefined safe profiles  |                           |
|  - Isolated argv arrays      |                           |
+--------------+---------------+                           |
               |                                           |
+--------------v---------------+                           |
| Desktop Bridge (IPC / Server)|                           |
| - Predefined native commands |                           |
| - No arbitrary shell API     |                           |
+--------------+---------------+                           |
               |                                           |
+--------------v---------------+                           |
| Local Nmap Child Process     |                           |
| - Vector spawn(argv)         |                           |
| - Captured to data/scans/    |                           |
+--------------+---------------+                           |
               |                                           |
+--------------v---------------+                           |
| Canonical Nmap XML Parser    +---------------------------+
| - Normalizes hosts & ports   |
| - Computes delta / changes   |
+--------------+---------------+
               |
+--------------v---------------+
| AI Structured Assessment     |
| - Gemini / DeepSeek schema   |
| - Strictly fact-grounded     |
+------------------------------+
```

---

## 4. Installation & Requirements

### System Requirements
- Node.js 18+ or Bun
- Nmap installed locally on the assessment workstation
  - Windows: Download installer from [nmap.org](https://nmap.org/download.html)
  - Linux: `sudo apt install nmap`
  - macOS: `brew install nmap`

### Windows Setup Instructions
1. Install Nmap using the official Windows installer (`nmap-<version>-setup.exe`).
2. Ensure Nmap is installed to one of the standard directories:
   - `C:\Program Files\Nmap\nmap.exe`
   - `C:\Program Files (x86)\Nmap\nmap.exe`
   - or ensure `nmap.exe` is registered in your system `%PATH%`.
3. Verify Nmap in Command Prompt or PowerShell:
   ```cmd
   nmap --version
   ```
4. Clone and install NETSCOPE dependencies:
   ```cmd
   npm install
   ```
5. Launch the application:
   ```cmd
   npm run dev
   ```
6. Open your browser at `http://localhost:3000`. Navigate to **Settings** and use the **Auto-Detect / Verify** button to confirm your Nmap binary is detected.

---

## 5. Execution Modes: Native Nmap vs Mock Mode

In **Settings**, the operator can switch between two execution modes:

1. **Real Nmap Mode (Local Native Binary)**:
   - Spawns the local Nmap executable as an isolated child process (`spawn`, `shell: false`).
   - Writes raw XML artifacts to `data/scans/<scan-id>/result.xml` and records `metadata.json`.
   - The native bridge monitors process state (`INITIALIZING`, `RUNNING`, `PARSING`, `COMPLETED`, `STOPPED`, `TIMEOUT`).
   - The user can click **STOP SCAN** anytime to terminate the active process cleanly.
   - Enforces configurable timeouts (default 120s) to prevent orphan processes.

2. **Mock Mode (Safe Simulation & Offline Development)**:
   - When enabled, the scanner generates sample XML fixtures (`sample-basic.xml` and `sample-changes.xml`) and feeds them into the real XML parser without touching live physical sockets.
   - Enables full UI testing and unit verification without network access.

---

## 6. Scan Lifecycle & Artifact Structure

Every completed or interrupted scan is stored in a clean, predictable directory structure:

```
data/
└── scans/
    └── scan-1727800000000/
        ├── metadata.json       # Scan parameters, profile, timestamps, exit codes
        └── result.xml          # Canonical Nmap XML output (-oX)
```

The scan follows this deterministic lifecycle:
`START` → `Target Validation` → `Argument Construction` → `Child Process Spawn` → `Live Telemetry` → `XML Capture` → `XML Parsing` → `Baseline Comparison` → `Inventory Merge` → `COMPLETED`.

---

## 7. Troubleshooting

* **"Nmap executable was not found"**:
  - Open **Settings** and check the **Nmap Status** indicator.
  - If using Windows, click the path suggestions (`C:\Program Files\Nmap\nmap.exe` or `C:\Program Files (x86)\Nmap\nmap.exe`) and click **Test Path**.
  - If Nmap is not installed, switch **Execution Mode** to **Mock Mode** to test the platform safely.
* **Permission Errors**:
  - Standard TCP Connect scans (`-sT`) and Ping sweeps (`-sn`) do not require administrator or root privileges.
  - If raw SYN stealth scanning is attempted outside NETSCOPE, elevation is needed. NETSCOPE intentionally sticks to unprivileged safe profiles (`-sT`) for production stability.

---

## 8. Testing

Run the automated test suite:

```bash
npm run test
```

Test coverage includes:
- **Target Validation**: Checks IPv4, CIDR ranges, hostnames, and command injection attempts.
- **Change Detection**: Validates all 6 change events (`NEW_HOST`, `REMOVED_HOST`, `PORT_OPENED`, `PORT_CLOSED`, `SERVICE_CHANGED`, `VERSION_CHANGED`).
- **Nmap Safe Argument Construction**: Verifies isolated argument vectors.
- **Nmap XML Parser**: Validates extraction of hosts, ports, products, versions, and malformed XML handling.
- **Process Lifecycle & States**: Validates lifecycle state transitions (`idle`, `initializing`, `running`, `parsing`, `completed`, `stopped`, `timeout`).

---

## 9. Build Instructions

```bash
npm run build
```

Compiled assets are placed in `dist/`. The full-stack runner can be started using:
```bash
npm start
```
