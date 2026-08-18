#!/usr/bin/env node
// Builds a connection log of requests originating from allowlisted Dutch ISPs
// (Ziggo, Odido; KPN also classified) by cross-referencing Front Door access-log
// client IPs against the CIDR ranges in config/isp-allowlist.json.
//
// Usage:
//   node scripts/isp-connection-log.mjs <afd-access.json> [outCsv]
//
// <afd-access.json> is a JSON array exported from Log Analytics, e.g.:
//   az monitor log-analytics query --workspace <id> --analytics-query \
//     "AzureDiagnostics | where Category == 'FrontDoorAccessLog' \
//      | project TimeGenerated, socketIp_s, clientIP_s, httpMethod_s, requestUri_s, \
//        httpStatusCode_s, userAgent_s, endpoint_s, trackingReference_s \
//      | order by TimeGenerated asc" -o json
//
// By default the log is scoped to Ziggo + Odido (the providers of interest); pass
// ISP_FILTER=kpn,ziggo,odido to widen it.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ALLOWLIST = resolve(__dirname, '..', 'config', 'isp-allowlist.json');

const inPath = process.argv[2];
const outCsv = process.argv[3] || resolve(process.cwd(), 'connection-log-ziggo-odido.csv');
if (!inPath) {
  console.error('Usage: node scripts/isp-connection-log.mjs <afd-access.json> [outCsv]');
  process.exit(1);
}

const filter = (process.env.ISP_FILTER || 'ziggo,odido')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ── CIDR matching (IPv4 + IPv6) via BigInt ranges ──────────────
function ipToBigInt(addr) {
  if (addr.includes(':')) {
    const [head, tail] = addr.split('::');
    const headParts = head ? head.split(':') : [];
    const tailParts = tail ? tail.split(':') : [];
    const missing = 8 - headParts.length - tailParts.length;
    const parts = [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts];
    return parts.reduce((acc, h) => (acc << 16n) + BigInt(parseInt(h || '0', 16)), 0n);
  }
  return addr.split('.').reduce((acc, o) => (acc << 8n) + BigInt(Number(o)), 0n);
}

function cidrToRange(cidr) {
  const [addr, prefixStr] = cidr.split('/');
  const v6 = addr.includes(':');
  const bits = v6 ? 128n : 32n;
  const prefix = BigInt(prefixStr);
  const value = ipToBigInt(addr);
  const hostBits = bits - prefix;
  const start = (value >> hostBits) << hostBits;
  const end = start + (1n << hostBits) - 1n;
  return { start, end, v6 };
}

const allow = JSON.parse(readFileSync(ALLOWLIST, 'utf8'));
const providers = ['kpn', 'ziggo', 'odido'].filter((p) => Array.isArray(allow[p]));
const ranges = {};
for (const p of providers) ranges[p] = allow[p].map(cidrToRange);

function classify(ip) {
  if (!ip) return null;
  const v6 = ip.includes(':');
  let val;
  try {
    val = ipToBigInt(ip);
  } catch {
    return null;
  }
  for (const p of providers) {
    for (const r of ranges[p]) {
      if (r.v6 === v6 && val >= r.start && val <= r.end) return p;
    }
  }
  return null;
}

// ── Load access log ────────────────────────────────────────────
const rows = JSON.parse(readFileSync(inPath, 'utf8'));

const csvEscape = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const header = ['timestamp', 'isp', 'client_ip', 'method', 'status', 'endpoint', 'request_uri', 'user_agent', 'tracking_ref'];
const out = [header.join(',')];
const counts = {};
let matched = 0;

for (const r of rows) {
  const ip = (r.socketIp_s && r.socketIp_s.trim()) || (r.clientIP_s && r.clientIP_s.trim()) || '';
  const isp = classify(ip);
  if (!isp || !filter.includes(isp)) continue;
  matched++;
  counts[isp] = (counts[isp] || 0) + 1;
  out.push([
    r.TimeGenerated,
    isp,
    ip,
    r.httpMethod_s,
    r.httpStatusCode_s,
    r.endpoint_s,
    r.requestUri_s,
    r.userAgent_s,
    r.trackingReference_s,
  ].map(csvEscape).join(','));
}

writeFileSync(outCsv, out.join('\n') + '\n', 'utf8');

console.log(`Connection log written: ${outCsv}`);
console.log(`Scope: ${filter.join(', ')}`);
console.log(`Matched ${matched} of ${rows.length} access-log records:`);
for (const p of filter) console.log(`  ${p}: ${counts[p] || 0}`);
