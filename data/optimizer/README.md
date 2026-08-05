# Optimizer agent — working data

Files in this folder are produced/maintained by the daily
[DC Data-Source Optimizer agent](../../docs/optimizer-agent.md)
(`scripts/agent/optimize.mjs`, run by `.github/workflows/data-source-optimizer.yml`).

| File | Purpose |
|------|---------|
| `last-run.json` | Machine-readable report of the most recent run (counts, briefing signals, promoted sources, **evaluation metrics**, **tuning changes**, algorithm recommendations, rejected samples). |
| `CHANGELOG.md` | Human-readable log of what each daily run changed. |
| `candidate-sources.json` | Lower-confidence discoveries parked for human review (not yet promoted). Created once the first backlog item appears. |
| `briefing-latest.json` | Cached copy of the last successfully ingested Cowork **DC Audio Briefing** (created only when a briefing source is configured). |
| `agent-params.json` | **Learned parameters** produced by the self-optimization step (acceptance threshold, candidate budget, per-country/category emphasis). Merged over config defaults on the next run. |
| `metrics-history.json` | Rolling history (~6 months) of per-run evaluation metrics, so the agent can act on trends. |

Promoted (high-confidence) sources are written into each country block of
[`../sources.json`](../sources.json) under `emerging_data_sources`.
