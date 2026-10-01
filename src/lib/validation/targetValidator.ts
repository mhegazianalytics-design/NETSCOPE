/**
 * NETSCOPE Target Validation Module
 * Enforces strict input validation to prevent command injection,
 * malformed inputs, and accidental out-of-scope scanning.
 */

export interface ValidationResult {
  isValid: boolean;
  type?: 'ipv4' | 'ipv4_range' | 'ipv4_cidr' | 'hostname';
  error?: string;
  normalizedTarget?: string;
  isPrivateNetwork?: boolean;
}

// Disallowed characters that could be abused in command or path arguments
const FORBIDDEN_CHARS = /[;&|`$><!\\"'\n\r\t(){}[\]]/;

// IPv4 pattern
const IPV4_REGEX =
  /^(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])$/;

// IPv4 CIDR pattern (restricted to /16 - /32 for safe local assessment)
const IPV4_CIDR_REGEX =
  /^(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\.(25[0-5]|24[0-9]|1[0-9]{2}|[1-9]?[0-9])\/(1[6-9]|2[0-9]|3[0-2])$/;

// Standard hostname pattern (RFC 1123)
const HOSTNAME_REGEX =
  /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

/**
 * Checks if an IPv4 address falls within RFC 1918 private space or loopback
 */
export function isRfc1918OrLoopback(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 127.0.0.0/8 (Loopback)
  if (parts[0] === 127) return true;
  // 169.254.0.0/16 (Link Local)
  if (parts[0] === 169 && parts[1] === 254) return true;

  return false;
}

/**
 * Validates a target specification before Nmap execution.
 * Only accepts clean IPv4, safe IPv4 CIDR ranges (/16-/32), or standard hostnames.
 */
export function validateTarget(input: string): ValidationResult {
  const target = input.trim();

  if (!target) {
    return {
      isValid: false,
      error: 'Target cannot be empty. Enter an IP (e.g., 192.168.1.1) or CIDR (e.g., 192.168.1.0/24).',
    };
  }

  // Length sanity limit
  if (target.length > 253) {
    return {
      isValid: false,
      error: 'Target exceeds maximum allowable length of 253 characters.',
    };
  }

  // Prevent shell metacharacters and control characters
  if (FORBIDDEN_CHARS.test(target)) {
    return {
      isValid: false,
      error: 'Target contains invalid or potentially dangerous characters. Shell metacharacters are rejected.',
    };
  }

  // Prevent spaces or multiple targets in one field
  if (/\s/.test(target)) {
    return {
      isValid: false,
      error: 'Whitespace is not permitted in target. Scan one IP, CIDR block, or hostname at a time.',
    };
  }

  // Check IPv4 Single Host
  if (IPV4_REGEX.test(target)) {
    return {
      isValid: true,
      type: 'ipv4',
      normalizedTarget: target,
      isPrivateNetwork: isRfc1918OrLoopback(target),
    };
  }

  // Check IPv4 CIDR
  if (IPV4_CIDR_REGEX.test(target)) {
    const baseIp = target.split('/')[0];
    return {
      isValid: true,
      type: 'ipv4_cidr',
      normalizedTarget: target,
      isPrivateNetwork: isRfc1918OrLoopback(baseIp),
    };
  }

  // Check if CIDR is too broad (e.g. /8 or /0)
  if (target.includes('/')) {
    return {
      isValid: false,
      error: 'CIDR subnet must be between /16 and /32 to prevent oversized scans on unauthorized scopes.',
    };
  }

  // Check Hostname
  if (HOSTNAME_REGEX.test(target)) {
    // Avoid top-level localhost or valid single label
    const isLocal = target.toLowerCase() === 'localhost' || target.toLowerCase().endsWith('.local');
    return {
      isValid: true,
      type: 'hostname',
      normalizedTarget: target.toLowerCase(),
      isPrivateNetwork: isLocal,
    };
  }

  return {
    isValid: false,
    error: 'Unrecognized target format. Expected valid IPv4 address (e.g. 10.0.0.1) or CIDR range (e.g. 192.168.1.0/24).',
  };
}

/**
 * Validates a port list string or array (e.g., "22,80,443" or [22, 80, 443])
 */
export function validatePortList(ports: string | number[]): { isValid: boolean; ports: number[]; error?: string } {
  const result: number[] = [];

  if (Array.isArray(ports)) {
    for (const p of ports) {
      if (typeof p !== 'number' || p < 1 || p > 65535 || !Number.isInteger(p)) {
        return { isValid: false, ports: [], error: `Invalid port number: ${p}. Must be 1-65535.` };
      }
      result.push(p);
    }
    return { isValid: true, ports: [...new Set(result)].sort((a, b) => a - b) };
  }

  const parts = ports.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { isValid: false, ports: [], error: 'Port list is empty.' };
  }

  for (const part of parts) {
    const num = Number(part);
    if (isNaN(num) || num < 1 || num > 65535 || !Number.isInteger(num)) {
      return { isValid: false, ports: [], error: `Invalid port entry: "${part}". Each port must be an integer between 1 and 65535.` };
    }
    result.push(num);
  }

  return { isValid: true, ports: [...new Set(result)].sort((a, b) => a - b) };
}
