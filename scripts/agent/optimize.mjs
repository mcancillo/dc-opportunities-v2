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
  log(`run start — scope=${cfg.countries.map(c => c.code).join(',')} budget=${cfg.runBudgetMinutes}min`);

  const briefing = await loadBriefing(cfg);
  if (budget.expired) throw new Error('budget exhausted after briefing');

  const { candidates, usage, recommendations } = await discover(cfg, cfg.countries, briefing);
  log(`discovered ${candidates.length} raw candidates (${budget.remainingSec}s left)`);

  const sources = readJson(cfg.output.sourcesFile);
  const backlog = readJson(cfg.output.candidatesFile, { updated_at: null, candidates: [] });

  const { accepted, newBacklog, rejected } = validateCandidates(candidates, { sources, backlog, cfg });

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
    counts: { discovered: candidates.length, promoted: accepted.length, backlog_added: newBacklog.length, rejected: rejected.length },
    promoted: accepted,
    algorithm_recommendations: recommendations,
    rejected_sample: rejected.slice(0, 15)
  };
  writeJson(cfg.output.reportFile, report);

  const changed = added > 0 || newBacklog.length > 0;
  if (changed) {
    const lines = [
      `## ${today}`,
      `- Briefing: ${briefing.origin}${briefing.source ? ` (${briefing.source})` : ''}; themes: ${Object.keys(briefing.signals.themes).join(', ') || 'none'}`,
      `- Promoted ${accepted.length} new source(s) into sources.json; ${newBacklog.length} added to review backlog; ${rejected.length} rejected/duplicate.`,
      ...accepted.map(a => `  - **[${a.country}]** ${a.name} — _${a.category}_ (${a.url})`),
      ...(recommendations.length ? ['- Algorithm recommendations:', ...recommendations.map(r => `  - ${r.factor}: ${r.change} — ${r.rationale}`)] : []),
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
    `| Candidates discovered | ${candidates.length} |`,
    `| Promoted to sources.json | ${accepted.length} |`,
    `| Added to review backlog | ${newBacklog.length} |`,
    `| Rejected / duplicate | ${rejected.length} |`,
    `| Algorithm recommendations | ${recommendations.length} |`,
    ''
  ].join('\n');
  writeStepSummary(summary);
  setActionsOutput('has_changes', changed ? 'true' : 'false');
  setActionsOutput('promoted', String(accepted.length));

  log(`run done — promoted=${accepted.length} backlog+=${newBacklog.length} rejected=${rejected.length} changed=${changed}`);
}

main().catch(err => { log('FATAL', err.stack || err.message); process.exit(1); });
