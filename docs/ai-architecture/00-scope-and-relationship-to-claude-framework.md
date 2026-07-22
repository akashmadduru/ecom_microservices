# Scope and Relationship to the `.claude/` Framework

Last verified against commit: `f6115d1`

## (a) This is a documentation-only pass

Everything under `docs/ai-architecture/` produced in this pass is a written artifact.
No runtime code, service configuration, gateway routing, Kafka topic/event definitions,
Terraform, Docker/Compose, or `.claude/` configuration is changed as part of producing
this blueprint. Where a document describes something that does not exist in the codebase
(e.g. a Cart bounded context, a vector-DB-backed RAG pipeline), that is stated explicitly
as a design proposal, not as an implemented system. Nothing in this tree should be read
as authorization to build any of the proposed pieces — it is the design work that would
precede a build decision, produced separately from that decision.

## (b) Relationship to `.claude/prompts/orchestration-protocol.md`

`.claude/prompts/orchestration-protocol.md` already defines a Standard Pipeline used by
`/plan-feature` and `/apply-plan`:

```
Feature Planner → Debug Planner* → Architecture Planner → [ APPROVAL GATE ] →
Feature Implementer → Optimization → Documentation Writer → Review* → Diagram Agent* →
Test Planner → Summary
```

This blueprint's planned dev-workflow document (`06-dev-workflow-and-claude-framework-overlay.md`,
not yet drafted) will be a pure **overlay/annotation** on that pipeline:

- It will describe how this repository's specific domain model, service boundaries, and
  maturity tags (Built / Reserved-in-infra / Conceptual-only) should inform decisions
  made *within* existing pipeline stages — e.g. what the Architecture Planner should
  flag when a plan touches a Reserved-in-infra domain that has no service behind it yet.
- It will **never** edit `orchestration-protocol.md` itself, redefine the Standard
  Pipeline, or introduce a second, competing pipeline. The live file remains the single
  source of truth for how agents are sequenced.
- Any recommendation in the overlay that would require changing the live pipeline is
  out of scope for that document — it gets raised as a proposal referencing the relevant
  section of `orchestration-protocol.md`, not applied silently.

Until that overlay is drafted, this blueprint has no effect on how `.claude/` agents
operate.

## (c) Pre-existing agent-framework inconsistency (named, not resolved)

Two independent, inconsistent agent-framework artifacts already exist in this repository:

1. `.claude/` — a full multi-agent framework (`agents/`, `commands/`, `prompts/`,
   `templates/`), oriented around a general-purpose Polymath orchestrator that spans
   Vue/TypeScript, Java/Spring, Rust, and Python/FastAPI stacks.
2. `.github/agents/microservices-backend.agent.md` — a single, standalone agent
   definition scoped specifically to this repository's FastAPI/microservices stack, with
   its own constraints, approach, and output format, independent of the `.claude/`
   framework's conventions (it does not reference the Standard Output Contract, the
   Standard Pipeline, or any `.claude/templates/` file).

These two artifacts were not reconciled before this blueprint was written, and
reconciling them is **out of scope for this documentation pass**. This blueprint does
not pick one as authoritative, does not merge them, and does not extend either one
beyond what already exists. This is named here as pre-existing technical debt so a future
task that does take on reconciliation has a starting reference, and so nothing in this
blueprint is misread as an implicit endorsement of one framework over the other.

## (d) Drafting resequencing: RAG design before MCP strategy

The user's original ask ordered these topics MCP strategy first, then RAG design. The
file numbering in this tree preserves that intended reading order (`01-mcp-strategy.md`
before `02-rag-design.md`). The **drafting order is reversed**: RAG design will be
written before MCP strategy, because a meaningful ranking of MCP servers in the
retrieval- and vector-DB-adjacent categories depends on which vector database this
repository's RAG design settles on. Ranking those MCP servers before that choice is made
would either be premature (ranking options against an undecided target) or would force
the MCP document to silently make the vector-DB decision itself, which is out of scope
for an MCP strategy document. Once `02-rag-design.md` fixes the vector-DB choice,
`01-mcp-strategy.md` can rank the relevant MCP servers against a concrete target and be
filled in without a subsequent rewrite.

Neither `01-mcp-strategy.md` nor `02-rag-design.md` is part of this pass's deliverables;
this section exists to record the sequencing decision before either is drafted, so the
eventual authoring order is not mistaken for an oversight when read against the file
numbering.
