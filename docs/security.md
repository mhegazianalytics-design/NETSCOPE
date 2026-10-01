# NETSCOPE Security Architecture & Operational Boundaries

## 1. Core Principles

NETSCOPE is designed as a defensive assessment tool for operators assessing networks they own or have explicit authorization to audit. It adheres to strict engineering constraints to prevent misuse, accidental damage, or command injection.

---

## 2. Hard Security Boundaries

The following capabilities are **explicitly prohibited** and will never be implemented in NETSCOPE:

* **No Credential Theft or Harvesting**: NETSCOPE does not attempt password cracking, dictionary attacks, or authentication bypass.
* **No Exploitation Modules**: NETSCOPE does not execute exploit payloads, memory corruption attacks, or lateral movement scripts.
* **No Evasion or Stealth Mechanisms**: NETSCOPE does not implement firewall evasion, fragmented packet obfuscation, or decoy packet spoofing.
* **No Arbitrary AI Execution**: The AI assistant has zero capability to generate or execute terminal commands.
* **No Packet Interception**: NETSCOPE does not perform promiscuous packet sniffing or ARP spoofing against third-party network traffic.

---

## 3. Native Bridge & Command Isolation (Phase 2)

### A. Total Absence of Generic Execution APIs
The native bridge (Tauri IPC / Express API) **never** exposes generic command runners such as:
- `execute_shell(...)`
- `run_command(...)`
- `exec(...)`
- `powershell / cmd / bash`

The bridge exposes **only** four predefined, parameter-restricted domain operations:
1. `getNmapStatus()` — Checks executable version with `--version`.
2. `startScan(request)` — Strictly validates target and launches approved profile vector.
3. `stopScan(scanId)` — Terminates only processes spawned by NETSCOPE.
4. `getScanStatus(scanId)` — Returns process state and reads XML artifact.

### B. Prevention of Command Injection
Command injection is structurally eliminated by avoiding shell execution entirely:
- **No Shell Interpolation**: Commands are never constructed via string concatenation (e.g., `"nmap " + target`).
- **Child Process Execvp / Vector Arguments**: The Nmap binary is invoked via isolated argument arrays (`spawn(nmapPath, args, { shell: false })`).
- **Strict Metacharacter Rejection**: Target strings containing shell characters (`;`, `&`, `|`, `` ` ``, `$`, `>`, `<`, quotes, newlines) are rejected during validation before any process invocation.

### C. Target Scope Validation
- Only valid IPv4 addresses (`192.168.1.1`), safe CIDR ranges (`192.168.1.0/24`), or RFC 1123 hostnames (`gateway.lan`) are accepted.
- Wide CIDR blocks (broader than `/16`) are blocked by default to prevent accidental scanning of vast IP spaces.
- Subnet whitelists in Settings enforce an operational boundary for continuous sweeps.

---

## 4. Process Governance & Resource Protection

1. **Process Cancellation (STOP SCAN)**: Every scan process retains an active PID reference allowing immediate graceful termination (`SIGTERM` / `SIGINT`) via the UI. Unrelated system processes are never touched.
2. **Execution Timeouts**: Scans that exceed their profile duration (default 120s) are automatically aborted by watchdog timers to prevent hanging background tasks.
3. **Machine-Readable Outputs**: All outputs are parsed directly from Nmap XML files (`-oX`) to prevent fragile or dangerous terminal scraping.

---

## 5. AI Air-Gap Architecture

The AI layer (Gemini / DeepSeek) is strictly downstream of completed scans:
```
Nmap Native Execution ──► XML Output ──► Parser ──► Normalized DB ──► Structured JSON ──► AI Analysis
```
- **No Direct Shell Access**: The AI model has no tool or mechanism to invoke native commands.
- **Fact-Grounded Analysis**: AI prompts only receive confirmed facts (active host IPs, responsive ports, verified banners). AI does not generate or speculate ungrounded vulnerability claims.
- **Read-Only**: The AI layer cannot modify scan schedules, launch probes, or edit network configurations.

---

## 6. Local-Only Persistence & Credential Safety

- **Local Persistence**: Scan records and target information reside strictly on the operator machine in SQLite (`~/.netscope/netscope.db`) and `data/scans/`.
- **No Telemetry or Phone-Home**: NETSCOPE transmits no analytics or usage statistics to external cloud endpoints.
- **API Key Storage**: AI provider keys are intended for storage within local OS keyrings/secure storage (e.g. Windows Credential Manager or secret storage) and are never logged or committed to version control.
