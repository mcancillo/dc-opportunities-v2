# DC Data-Source Optimizer Agent

An autonomous agent that runs **once every 24 hours** to continuously improve how
the tool finds land suitable for datacenters. It ingests the Cowork **DC Audio
Briefing**, discovers new data sources and analytical angles for the in-scope
countries, and **pushes the enhancements into the repo as a pull request**.
Each run is capped at **2 hours**.

- Agent code: [`scripts/agent/`](../scripts/agent)
- Schedule / runner: [`.github/workflows/data-source-optimizer.yml`](../.github/workflows/data-source-optimizer.yml)
- Working data & reports: [`data/optimizer/`](../data/optimizer)

---

## Scope

Countries assessed (current scope): **Netherlands (NL), Belgium (BE), Germany
(DE), Poland (PL), Spain (ES)**. Defined in
[`scripts/agent/config.json`](../scripts/agent/config.json) and mirrored in the
app's `SUPPORTED_COUNTRIES` (`src/services/peeringdb.js`) and scoring tables.
To change scope, edit `config.json` `countries` (and the app constants).

> Belgium was added to the tool as part of this scope change (PeeringDB IX
> filter, scoring climate/grid tables, and `data/sources.json`).

---

## What each daily run does

1. **Ingest the DC Audio Briefing** (managed by Cowork) → extract signals
   (themes such as power/land/permitting/connectivity and which countries are
   emphasised). See "Cowork integration" below.
2. **Discover** new data sources & angles for datacenter plots:
   - a curated **seed** set of new angles (grid-connection-capacity APIs,
     industrial/brownfield land registers, permitting/zoning registries,
     renewable-auction data, port-authority land, SEZs, …), plus
   - optional **LLM expansion** informed by the briefing (only if an API key is
     configured — otherwise it runs seed-only at zero token cost).
3. **Validate & dedupe** candidates against everything already in
   `data/sources.json` and the review backlog (https-only, in-scope, unique domain).
4. **Promote** high-confidence sources (≥ `acceptance.minConfidence`, default
   0.7) into `data/sources.json` under each country's `emerging_data_sources`;
   park the rest in `data/optimizer/candidate-sources.json` for review.
5. **Record** algorithm-tuning recommendations in the run report (the agent
   **never** edits the scoring algorithm automatically — those are for human
   review).
6. **Open/update a pull request** with the changes (branch
   `optimizer/auto-updates`). If a run finds nothing new, no PR is created.

## Evaluation & self-optimization (feedback loop)

Every run ends with an **evaluation** step that scores its own output, followed
by an **optimization** step that tunes the agent's parameters for the next run.
This closes the loop so the agent improves over time instead of repeating the
same behaviour.

### Evaluation — `lib/evaluate.mjs`
Computes a set of metrics and a composite **quality score (0–100)**:

| Metric | What it measures | Weight |
|--------|------------------|:------:|
| Reachability | Sample of promoted/emerging source URLs that actually respond (gated 401/403/429 count as alive; only DNS/TLS errors, timeouts, 404/410, 5xx are "dead") | 40% |
| Country coverage | Share of in-scope countries with ≥1 emerging source | 20% |
| Category diversity | Normalized Shannon entropy across source categories (avoid over-indexing one angle) | 15% |
| Briefing utilization | Whether a Cowork briefing was actually ingested | 15% |
| Promotion flow | Rewards a healthy (not runaway) promotion rate | 10% |

Metrics are appended to `data/optimizer/metrics-history.json` (kept ~6 months)
and embedded in `last-run.json`. The reachability probe is bounded (≤15 URLs,
8 s each) and respects the run budget.

### Optimization — `lib/tune.mjs`
Adjusts **learned parameters** in `data/optimizer/agent-params.json`, applied on
the next run. All moves are bounded and logged (see `tuning.changes` in the
report / the changelog):

| Signal | Action |
|--------|--------|
| Reachability < 60% | Raise `minConfidence` (be pickier) |
| Reachability ≥ 90% | Slightly lower `minConfidence` (allow more flow) |
| 3 consecutive runs with 0 promotions | Raise `maxCandidatesPerCountry` and lower `minConfidence` (explore more) |
| A country has 0 emerging sources | Boost that country's discovery emphasis |
| A country is over-represented | Decay its emphasis toward neutral |
| A target category is under-represented | Boost that category's emphasis |

Bounds: `minConfidence` ∈ [0.55, 0.90], `maxCandidatesPerCountry` ∈ [3, 12],
emphasis ∈ [0.5, 2.0]. The learned emphasis weights feed back into discovery
(seed ordering + the LLM prompt), and the learned `minConfidence` feeds the
acceptance gate — so the evaluation genuinely steers subsequent runs.

The agent **never** auto-edits the scoring algorithm; algorithm-tuning ideas are
recorded as recommendations for human review.

## The 2-hour/day cap

Two independent limits enforce it:

- **CI job timeout** `timeout-minutes: 120` in the workflow — a hard ceiling; the
  job is killed at 120 minutes.
- **Agent self-budget** `runBudgetMinutes: 115` in `config.json` — the agent
  checks a wall-clock deadline and stops early, well before the CI ceiling.

`concurrency` also prevents two daily runs from overlapping.

## Cowork "DC Audio Briefing" integration

Cowork has no public API in this environment, so the briefing is consumed as an
**export** that Cowork drops where the agent can read it. Configure **one** repo
secret:

| Secret | Meaning |
|--------|---------|
| `DC_AUDIO_BRIEFING_URL` | HTTPS URL to the briefing export (`.json`, `.txt`, `.md`, or `.vtt`). |
| `DC_AUDIO_BRIEFING_FILE` | Path to a briefing file available in the workflow (e.g. downloaded artifact). |

The ingester handles JSON transcripts, plain text/markdown, and WebVTT captions,
and caches the last good copy to `data/optimizer/briefing-latest.json`. If no
briefing is configured, the agent still runs (seed-only) and logs that fact.

> **Action for you:** wire Cowork to publish the DC Audio Briefing to a stable
> URL (or a scheduled artifact) and set the secret above. Until then the briefing
> signals are empty and discovery relies on the curated seeds.

## Optional LLM expansion

Set these secrets to enable briefing-driven LLM discovery (OpenAI-compatible or
Azure OpenAI):

| Secret | Example |
|--------|---------|
| `LLM_API_KEY` | API key |
| `LLM_ENDPOINT` | `https://api.openai.com/v1` or `https://<res>.openai.azure.com` |
| `LLM_MODEL` | `gpt-4o-mini` (OpenAI) or the Azure **deployment name** |

Without a key the agent is fully functional in heuristic mode and incurs **no
token cost**.

## Run it manually / locally

- **Manually in CI:** Actions → *DC Data-Source Optimizer (daily)* → *Run workflow*.
- **Locally:** `npm run optimize` (uses the same env vars; writes to
  `data/optimizer/` and `data/sources.json`).

---

## Cost per day

The agent is deliberately cheap. Two cost components:

### 1. Compute (GitHub Actions minutes)
Typical run finishes in well under a minute (seed-only) or ~2–3 minutes (with
LLM). Linux runner billing is **$0.008/min** on private repos (Actions is
**free** on public repos), and GitHub plans include free minutes (Free = 2,000,
Pro/Team = 3,000 min/month).

| Runtime | Compute cost/day | /month |
|---------|------------------|--------|
| Seed-only (~1 min) | ~$0.008 | ~$0.24 |
| With LLM (~3 min) | ~$0.024 | ~$0.72 |
| Worst case: hits the 120-min cap daily | ~$0.96 | ~$28.80 (3,600 min — exceeds the 2,000/3,000-min free tiers, so overage applies) |

On a public repo, or within your plan's included minutes, real compute cost is
effectively **$0**.

### 2. LLM tokens (only if enabled)
One request/day: ~6k input tokens (briefing + prompt) and up to 4k output tokens.

| Model | Token cost/day | /month |
|-------|----------------|--------|
| none (heuristic) | $0 | $0 |
| `gpt-4o-mini` | ~$0.003 | ~$0.10 |
| `gpt-4o` | ~$0.055 | ~$1.65 |

### Bottom line

| Configuration | **Cost/day** | ~/month |
|---------------|--------------|---------|
| Seed-only (no LLM) | **< $0.01** | ~$0.24 (or $0 within free minutes) |
| + `gpt-4o-mini` | **~$0.01** | ~$0.35 |
| + `gpt-4o` | **~$0.08** | ~$2.40 |
| Absolute worst case (cap hit + `gpt-4o`) | **~$1.02** | ~$30 |

This sits far below the solution's monthly budget cap, and the run is bounded to
two hours of compute per day regardless of configuration.
