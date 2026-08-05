// DC Opportunities — daily data-source optimizer agent (orchestrator).
//
// Runs once per day (via GitHub Actions), capped to a wall-clock budget that is
// shorter than the CI job timeout. It:
//   1. ingests the Cowork "DC Audio Briefing" for signals,
//   2. discovers new data sources / angles for datacenter plots (seeds + optional LLM),
//   3. validates & dedupes them against what the repo already knows,
//   4. promotes high-confidence sources into data/sources.json (emerging_data_sources),
//      parks the rest in a review backlog, and records algorithm recommendations,
//   5. writes a run report + changelog. The workflow then opens/updates a PR.
import fs from 'node:fs';
import { readJson, writeJson, appendFile, repoPath, log, Budget } from './lib/util.mjs';
import { loadBriefing } from './lib/briefing.mjs';
import { discover } from './lib/discover.mjs';
import { validateCandidates } from './lib/validate.mjs';
import { loadParams, saveParams } from './lib/params.mjs';
import { evaluate, loadHistory, pushHistory } from './lib/evaluate.mjs';
import { optimizeParams } from './lib/tune.mjs';

const cfg = readJson('scripts/agent/config.json');

function promoteIntoSources(sources, accepted) {
  let added = 0;
  for (const entry of accepted) {
    const c = sources[entry.country];
    if (!c) continue;
    if (!Array.isArray(c.emerging_data_sources)) c.emerging_data_sources = [];
    c.emerging_data_sources.push({
      name: entry.name,
      url: entry.url,
      category: entry.category,
      angle: entry.angle,
      added_by: 'optimizer-agent',
      added_at: entry.discovered_at
    });
    added++;
  }
  return added;
}

function setActionsOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function writeStepSummary(md) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

async function main() {
  const budget = new Budget(cfg.runBudgetMinutes);
  const today = new Date().toISOString().slice(0, 10);
  const params = loadParams(cfg);
  log(`run start — scope=${cfg.countries.map(c => c.code).join(',')} budget=${cfg.runBudgetMinutes}min minConfidence=${params.minConfidence} maxCand=${params.maxCandidatesPerCountry}`);

  const briefing = await loadBriefing(cfg);
  if (budget.expired) throw new Error('budget exhausted after briefing');

  const { candidates, usage, recommendations } = await discover(cfg, cfg.countries, briefing, params);
  log(`discovered ${candidates.length} raw candidates (${budget.remainingSec}s left)`);

  const sources = readJson(cfg.output.sourcesFile);
  const backlog = readJson(cfg.output.candidatesFile, { updated_at: null, candidates: [] });

  const { accepted, newBacklog, rejected } = validateCandidates(candidates, { sources, backlog, cfg, minConfidence: params.minConfidence });

  const added = promoteIntoSources(sources, accepted);
  if (added) writeJson(cfg.output.sourcesFile, sources);

  if (newBacklog.length) {
    backlog.candidates.push(...newBacklog);
    backlog.updated_at = new Date().toISOString();
    writeJson(cfg.output.candidatesFile, backlog);
  }

  const report = {
    run_at: new Date().toISOString(),
    scope: cfg.countries.map(c => c.code),
    briefing: { origin: briefing.origin, source: briefing.source || null, themes: briefing.signals.themes, countries: briefing.signals.countries },
    llm_used: !!usage,
    token_usage: usage || null,
    params_used: { minConfidence: params.minConfidence, maxCandidatesPerCountry: params.maxCandidatesPerCountry },
    counts: { discovered: candidates.length, promoted: accepted.length, backlog_added: newBacklog.length, rejected: rejected.length },
    promoted: accepted,
    algorithm_recommendations: recommendations,
    rejected_sample: rejected.slice(0, 15)
  };

  // ── Evaluation + self-optimization ─────────────────────────────
  // Score this run's quality (reachability, coverage, diversity, briefing use),
  // then tune the agent's learned parameters for the next run.
  const metrics = await evaluate(cfg, { sources, run: report, briefing, budget });
  const history = loadHistory();
  const { params: tunedParams, changes: tuningChanges } = optimizeParams(cfg, { metrics, history, params });
  saveParams(tunedParams);
  pushHistory(history, metrics);

  report.evaluation = metrics;
  report.tuning = { changes: tuningChanges, params: { minConfidence: tunedParams.minConfidence, maxCandidatesPerCountry: tunedParams.maxCandidatesPerCountry, countryEmphasis: tunedParams.countryEmphasis, categoryEmphasis: tunedParams.categoryEmphasis } };
  writeJson(cfg.output.reportFile, report);

  const paramsChanged = tuningChanges.length > 0;
  const changed = added > 0 || newBacklog.length > 0 || paramsChanged;
  if (changed) {
    const lines = [
      `## ${today}`,
      `- Briefing: ${briefing.origin}${briefing.source ? ` (${briefing.source})` : ''}; themes: ${Object.keys(briefing.signals.themes).join(', ') || 'none'}`,
      `- Quality score: **${metrics.quality_score}/100** (reachability ${metrics.reachability == null ? 'n/a' : (metrics.reachability * 100).toFixed(0) + '%'}, coverage ${(metrics.country_coverage * 100).toFixed(0)}%, diversity ${metrics.category_diversity.toFixed(2)}).`,
      `- Promoted ${accepted.length} new source(s) into sources.json; ${newBacklog.length} added to review backlog; ${rejected.length} rejected/duplicate.`,
      ...accepted.map(a => `  - **[${a.country}]** ${a.name} — _${a.category}_ (${a.url})`),
      ...(recommendations.length ? ['- Algorithm recommendations:', ...recommendations.map(r => `  - ${r.factor}: ${r.change} — ${r.rationale}`)] : []),
      ...(tuningChanges.length ? ['- Self-tuning:', ...tuningChanges.map(c => `  - ${c}`)] : []),
      ''
    ];
    appendFile(cfg.output.changelogFile, lines.join('\n') + '\n');
  }

  const summary = [
    `### DC data-source optimizer — ${today}`,
    '',
    `| Metric | Value |`,
    `|---|---|`,
    `| Scope | ${cfg.countries.map(c => c.code).join(', ')} |`,
    `| Briefing | ${briefing.origin} |`,
    `| LLM used | ${report.llm_used ? 'yes' : 'no (heuristic seeds)'} |`,
    `| **Quality score** | **${metrics.quality_score}/100** |`,
    `| Reachability | ${metrics.reachability == null ? 'n/a' : (metrics.reachability * 100).toFixed(0) + '%'} (${metrics.reachability_checked} checked) |`,
    `| Country coverage | ${(metrics.country_coverage * 100).toFixed(0)}% |`,
    `| Category diversity | ${metrics.category_diversity.toFixed(2)} |`,
    `| Candidates discovered | ${candidates.length} |`,
    `| Promoted to sources.json | ${accepted.length} |`,
    `| Added to review backlog | ${newBacklog.length} |`,
    `| Rejected / duplicate | ${rejected.length} |`,
    `| Algorithm recommendations | ${recommendations.length} |`,
    `| Self-tuning changes | ${tuningChanges.length} |`,
    ''
  ].join('\n');
  writeStepSummary(summary);
  setActionsOutput('has_changes', changed ? 'true' : 'false');
  setActionsOutput('promoted', String(accepted.length));

  log(`run done — quality=${metrics.quality_score} promoted=${accepted.length} backlog+=${newBacklog.length} rejected=${rejected.length} tuned=${tuningChanges.length} changed=${changed}`);
}

main().catch(err => { log('FATAL', err.stack || err.message); process.exit(1); });
