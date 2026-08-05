// Shared helpers for the optimizer agent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../..');

export function repoPath(rel) {
  return path.join(REPO_ROOT, rel);
}

export function readJson(rel, fallback = null) {
  const p = repoPath(rel);
  if (!fs.existsSync(p)) return fallback;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

export function writeJson(rel, obj) {
  const p = repoPath(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

export function appendFile(rel, text) {
  const p = repoPath(rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.appendFileSync(p, text);
}

// Extract a normalized hostname for dedupe (drops scheme, www., trailing slash).
export function domainOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.replace(/^www\./, '');
  } catch {
    return String(url).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export function log(...args) {
  console.log(`[optimizer ${new Date().toISOString()}]`, ...args);
}

// Simple wall-clock budget guard so the agent self-terminates before the CI job timeout.
export class Budget {
  constructor(minutes) {
    this.deadline = Date.now() + minutes * 60_000;
  }
  get expired() {
    return Date.now() >= this.deadline;
  }
  get remainingSec() {
    return Math.max(0, Math.round((this.deadline - Date.now()) / 1000));
  }
}
