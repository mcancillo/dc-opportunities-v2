// Learned parameters for the optimizer agent. These are produced by the
// self-optimization (tune) step and merged over the static config defaults on
// each run, so the agent adapts over time. Bounded and fully logged.
import { readJson, writeJson } from './util.mjs';

export const PARAM_BOUNDS = {
  minConfidence: { min: 0.55, max: 0.9, step: 0.05 },
  maxCandidatesPerCountry: { min: 3, max: 12, step: 1 },
  emphasis: { min: 0.5, max: 2.0 }
};

export function defaultParams(cfg) {
  const emphasis = Object.fromEntries(cfg.countries.map(c => [c.code, 1]));
  return {
    updated_at: null,
    minConfidence: cfg.acceptance.minConfidence,
    maxCandidatesPerCountry: cfg.llm.maxCandidatesPerCountry,
    countryEmphasis: emphasis,
    categoryEmphasis: {},
    notes: []
  };
}

// Load learned params, backfilling any missing keys from defaults.
export function loadParams(cfg) {
  const d = defaultParams(cfg);
  const saved = readJson('data/optimizer/agent-params.json');
  if (!saved) return d;
  return {
    ...d,
    ...saved,
    countryEmphasis: { ...d.countryEmphasis, ...(saved.countryEmphasis || {}) },
    categoryEmphasis: { ...d.categoryEmphasis, ...(saved.categoryEmphasis || {}) }
  };
}

export function saveParams(params) {
  writeJson('data/optimizer/agent-params.json', params);
}

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const round2 = (v) => Math.round(v * 100) / 100;
