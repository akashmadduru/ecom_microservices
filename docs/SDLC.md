# Standardized SDLC

This document is the single source of truth for how work happens in this repository —
where documentation lives, and what process a feature or bug fix goes through before it's
considered done. It's the human-readable counterpart to
`.claude/agents/orchestrator/sdlc-root.md`, which encodes the same process as an agent.

## Documentation lives in one place: `docs/` at repo root

Every piece of project documentation — for every component, backend or frontend — lives
under the root `docs/` folder. No component keeps its own `docs/` subdirectory (`apps/*/docs/`,
`python/services/*/docs/`, etc. do not exist and should not be recreated).

```
docs/
├── SDLC.md                        This file.
├── DecisionLog.md                 Platform-wide, append-only. Most-recent-decision-first.
│                                    Never edit a historical entry except to mark it superseded.
├── FutureWork.md                  Platform-wide, append-only backlog. Same append-only rule.
├── changes/                       Dated changelog entries, one file per change set
│                                    (YYYY-MM-DD-short-description.md).
├── features/                      Feature specs, one file per feature.
├── postman_collection.json        The one Postman collection for the whole platform.
├── ai-architecture/                Domain-driven-design reference model (bounded contexts,
│                                    aggregates) — describes intended domain shape, not
│                                    necessarily 1:1 with current implementation status.
├── services/<service-name>/       Per-backend-service architecture docs (convention;
│   ├── README.md                   not every service has one yet — add when a service's
│   ├── hld/HLD.md                  design is complex enough to warrant it, don't create
│   ├── lld/LLD.md                  empty placeholders for the others).
│   └── diagrams/
└── apps/<app-name>/                Per-frontend-app docs, same convention, mirrored.
    └── (e.g. apps/ecom-web/ — carries its own versioned v1/v2/v3 history from
        before it was absorbed into this repo; new work adds new dated files here,
        it does not need new version folders)
```

**Adding docs for a new component** (a 5th backend service, a 2nd frontend app): create
`docs/services/<name>/` or `docs/apps/<name>/` following the existing `product-service`/
`ecom-web` layout. Cross-cutting decisions and backlog items still go in the root
`DecisionLog.md`/`FutureWork.md`, not a per-component copy — there is exactly one of each
for the whole platform.

## The standardized pipeline

Every feature and every bug fix goes through the same pipeline, run via the
**`sdlc-root`** agent (`.claude/agents/orchestrator/sdlc-root.md`) or the equivalent
`/plan-feature` / `/plan-debug` commands, which implement the same
`Standard Pipeline` defined in `.claude/prompts/orchestration-protocol.md`:

```
Feature Planner
   ↓ (implementation plan, impacted files, risks)
Debug Planner            [bug fixes: root-cause analysis before any plan is written]
   ↓
Architecture Planner
   ↓ (HLD/LLD deltas, diagrams needed)
Approval Gate            [scope, impacted files, risks, complexity — wait for go-ahead]
   ↓
Feature Implementer
   ↓ (code changes)
Technical Debt / Performance    [as applicable]
   ↓
Documentation Writer
   ↓ (writes into docs/ per the convention above — never elsewhere)
Code Review Agent + Security Review Agent   [security review is mandatory for any
   ↓                                          change touching auth, data, or input handling]
Test Planner
   ↓
Summary
```

This is not optional scaffolding — it's the same sequence used for every substantial
change in this repository's history (see `docs/DecisionLog.md`'s entries, each traceable
to a plan → architecture → implementation → review → docs → test cycle). A one-line fix
explicitly scoped by the requester can skip straight to implementation + a `Changes.md`
entry; anything larger runs the full pipeline.

**The Approval Gate is mandatory** for anything that reaches Feature Implementer — present
scope, impacted files, risks, and complexity before writing code, unless the requester has
explicitly pre-authorized a single pass.

## CI/CD as the automated half of the pipeline

Once code lands, `.github/workflows/` enforces the same standard mechanically, per
component, independently:

- `ci-{api-gateway,auth-service,inventory-service,product-service,ecom-common,ecom-web}.yml`
  — lint, unit tests (`product-service` also runs its `integration`-marked tests), Docker
  build (pushed to `ghcr.io` only on merge to `main`).
- `lint-workflows.yml` — `actionlint` over the CI system itself.
- `cd-deploy.yml` — `workflow_dispatch`-only stub; real deployment isn't wired yet (see
  `docs/FutureWork.md`).

A change is not "done" until its component's CI workflow passes — the pipeline above
produces the change, CI verifies it stayed correct.

## Repository structure this process assumes

- `python/` — the entire Python workspace (`pyproject.toml`, `uv.lock`, `services/`,
  `libs/ecom_common`). All `uv` commands target it explicitly
  (`uv --directory python ...`, or `cd python` first).
- `apps/ecom-web/` — the Vue frontend, self-contained (own `package.json`/`package-lock.json`),
  talks to the backend exclusively through `api_gateway`.
- `deploy/`, `terraform/` — shared container/infra plumbing, not owned by any single
  component.
- `scripts/` — repo-level utility scripts (not per-component).

See the root `README.md`'s "Repository layout" section for the full annotated tree.

## Non-negotiables

1. No new per-component `docs/` folder. Everything goes in root `docs/`.
2. No skipping the Approval Gate for anything beyond an explicitly-scoped trivial fix.
3. Security Review Agent runs on any change touching auth, authorization, input handling,
   or data exposure — not optional, not "probably fine."
4. `DecisionLog.md` and `FutureWork.md` are append-only. Historical entries describe what
   was true when they were written — update them only to mark an entry superseded, never
   to rewrite history for a later refactor (e.g. a path that moved).
5. Every restructuring or architectural decision gets a `DecisionLog.md` entry explaining
   *why*, including alternatives considered — not just what changed.
