# DC Data-Source Optimizer Agent

An autonomous agent that runs **once every 24 hours** to continuously improve how
the tool finds land suitable for datacenters. It ingests the Cowork **DC Audio
Briefing**, discovers new data sources and analytical angles for the in-scope
countries, and **pushes the enhancements into the repo as a pull request**.

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

## The 1-hour/day cap

Two independent limits enforce it:

- **CI job timeout** `timeout-minutes: 60` in the workflow — a hard ceiling; the
  job is killed at 60 minutes.
- **Agent self-budget** `runBudgetMinutes: 55` in `config.json` — the agent
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
| Worst case: hits the 60-min cap daily | ~$0.48 | ~$14.40 (1,800 min — still inside the 2,000-min free tier) |

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
| Absolute worst case (cap hit + `gpt-4o`) | **~$0.54** | ~$16 |

This sits far below the solution's monthly budget cap, and the run is bounded to
one hour of compute per day regardless of configuration.
