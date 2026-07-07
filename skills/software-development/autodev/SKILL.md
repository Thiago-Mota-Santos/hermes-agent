---
name: autodev
description: Use when running the Hodler full-cycle feature command (the user types `/autodev <task>`). Seven gated phases — classify, Socratic discovery, max-detail plan, blueprint contract, implement + build gate + draft PR, OpenClaw review + crabbox staging validation, and a same-session fix loop where OpenClaw drives changes back through the PR (the PR is the command bus, no server-side state).
version: 5.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [autodev, hodler, workflow, pr, openclaw, crabbox, review, ci, agentic]
    related_skills: [avenia-api]
---

> **Provenance & scope.** This is the Hodler monorepo's `/autodev` command, ported here so this
> agent has the full playbook. Path references like `skills/hodler/...` and `docs/...` are
> **relative to the Hodler monorepo** (where this workflow runs), and the infrastructure it drives
> — the SSH box `root@178.104.175.8`, OpenClaw, crabbox, the Telegram ops chat, `gh` on the box —
> is Hodler's. Run it from a Hodler checkout; treat the paths as Hodler-repo-relative.

# autodev v5 — full-cycle feature command

One command. Seven phases. Zero shortcuts.

**Split of responsibility:**
- **The live coding session** — classifies, asks Socratic questions, writes the
  plan + blueprint contract, edits files, runs the build gate, opens the PR, and
  applies every fix. The session stays alive and owns the loop.
- **OpenClaw (on the SSH box, reached over SSH)** — runs an independent review of the
  diff and a crabbox staging capture, then **posts its verdict and any change-commands
  back onto the PR**. It never edits code and never merges.

There is **no touri-side state**. The **GitHub PR is the command bus**: OpenClaw writes
`autodev:verdict` / `autodev:command` comments, and the same session that opened the PR
polls them and acts. This is how "OpenClaw triggers a change that calls back the same
coding session" works — through the PR, not a server inbox.

```
 0 CLASSIFY   route via skills/hodler routing-matrix
 1 DISCOVER   Socratic Qs: scope / data / security / edges        (AskUserQuestion)
 2 PLAN       max-detail task list with dependencies
 3 BLUEPRINT  contract.md: goal + AC + constraints + Test Block
 4 EXECUTE    implement → build gate → draft PR
 5 REVIEW     OpenClaw deepseek diff review + crabbox staging capture (over SSH)
 6 FIX-LOOP   poll PR for verdict/command → same session fixes → push → repeat
```

Each phase gates the next. Do **not** skip phases. Do **not** add unsolicited features.

---

## When to use vs. not

Use `/autodev` for: new features needing design decisions, cross-layer changes
(server + frontend), refactors with multiple dependencies.

Skip it for: a single-file trivial fix (just edit + `/w`), or a pure docs change.
If the user says "quick", collapse phases 0-3 into a one-line contract and go.

---

## Phase 0 — CLASSIFY

Route the task to **exactly one** workflow using
`skills/hodler/SKILL.md` → `skills/hodler/reference/routing-matrix.md`.
The chosen workflow's `SKILL.md` is the contract you implement against in Phase 4.
Inherit all project hard rules (single export per file, arrow fns, no `let`/`else`/
classes, no type assertions, RO-RO, blank-line padding, no `findById`, PT-BR error
messages, no emojis).

State the classification in one line: `Workflow: <name> — <why>`.

---

## Phase 1 — DISCOVER (Socratic)

Before any plan, surface what the one-liner left implicit. Ask with
**`AskUserQuestion`** (batch related questions; max 4 per call). Cover the four axes —
skip an axis only if the task genuinely cannot touch it, and say so:

- **Scope** — what is in vs. out? Which surfaces/routes/modules change? What is
  explicitly *not* changing?
- **Data** — which Mongo models / GraphQL types / ledgers are read or written? New
  fields? Migrations? Owner-scoping on every query?
- **Security** — auth boundary, KYC tier, feature flag, staging allowlist, money
  movement (idempotency, run-once), secrets. Cross-check `docs/SECURITY.md`.
- **Edge cases** — empty/first-run state, non-idempotent replays, error/PT-BR copy,
  concurrency, prod-vs-staging differences.

Phase 1 gates Phase 2: **do not plan until the discovery answers are in.** If the user
said "quick", ask only the single highest-risk question (usually money/security).

---

## Phase 2 — PLAN (max detail)

Produce a structured, dependency-ordered task list. Each task:

- a stable id (`T1`, `T2`, …) and one-sentence intent,
- the **exact file path** to create/edit and the existing pattern it mirrors,
- its dependencies (`depends: T1`),
- the acceptance signal (what proves it done).

End with an **open-risks** list (anything discovery could not fully close). Keep it
concrete — file paths and function names, not "update the backend". This plan is the
single source of truth Phase 4 executes top to bottom.

---

## Phase 3 — BLUEPRINT (the contract)

Write the contract to `docs/openclaw/autodev/contracts/<slug>.md` using the
**Hodler Contract Blueprint** (`skills/hodler/reference/contract-blueprint.md`) —
fill **every** section (1 Goal & porquê · 2 Custódia & não-vazamento · 3 Owner-scoping ·
4 Feature flag · 5 Provider/rail · 6 Security tier + enforcement · 7 Acceptance + OpenClaw
Test Block · 8 Evidência). Each section maps to a `docs/GUIDE.md` invariant; no section is
left blank without an `N/A — motivo`. Derive the acceptance criteria from sections 2-6 so
custody/security cannot be an afterthought.

The blueprint is what OpenClaw reads in Phase 5. If a criterion can't be expressed as a
Test Block step, that criterion is untestable — reword it. The blueprint's **Gate de
enforcement** is the same checklist Phase 5 review runs.

---

## Phase 4 — EXECUTE

1. **Branch** off `origin/main`: `git fetch origin && git checkout -b <branch> origin/main`.
2. **Read each target file before editing** — never edit blind.
3. **Implement the plan top to bottom**, one task at a time, following the workflow
   contract + hard rules. Result pattern everywhere:
   `{ success: true, data } | { success: false, error }`.
4. **Automated tests (`vitest`) — MANDATORY, never skip.** A feature is not done
   without them. For every behaviour you add or change, write a `*.spec.ts` next to
   the code (no `describe` — top-level `it()`; mirror an existing spec such as
   `apps/server/src/modules/arkadeOperator/assertMainnetAllowed.spec.ts`). The tests
   must exercise the **flow** and assert **that what was asked is correct** — the exact
   error strings, the success path, and every boundary case from the acceptance
   criteria. Prefer a pure unit spec on the core function (narrow the arg type, e.g.
   `Pick<IUser, …>`, so no casts are needed); add endpoint/integration specs (the
   `test/setup.ts` harness gives an in-memory Mongo + supertest) when the logic spans
   I/O. **If the touched area has no test, create one** — never leave a feature
   untested, and never weaken an assertion to make it pass.
5. **Build gate** — actually run it, fix until green. This includes the tests:
   ```bash
   pnpm -w build && pnpm -w lint
   pnpm --filter @hodler/server test -- run <path/to/your>.spec.ts   # green, no skips
   ```
6. **Commit + push**:
   ```bash
   git add <specific files>
   git commit -m "<message>

   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
   git push -u origin <branch>
   ```
7. **Open a DRAFT PR** with `gh pr create --draft`. The body MUST contain the
   acceptance-criteria checkboxes and the `## OpenClaw Test Block`. Add the label
   `autodev` so the box recognizes it. Keep it draft until Phase 6 passes.

Record the PR number — it is the address of the command bus for Phase 6.

---

## Phase 5 — REVIEW (OpenClaw, over SSH)

OpenClaw runs on the SSH box (`root@178.104.175.8`). Dispatch both legs against the
branch; the box already has `openclaw`, `crabbox`, and `gh` authed. The skill content
(review prompt + `autodev-validate` + `capture.cjs`) is sourced from **the Hodler repo** —
the box just executes it. Deploy the branch to staging **before** capturing.

```bash
ssh root@178.104.175.8 \
  "cd /root/.openclaw/workspace/skills/autodev && \
   USE_CRABBOX=1 ./scripts/review-pr.sh <branch> 2>&1"
```

- **Review leg** → `openclaw agent --agent main --model opencode-go/deepseek-v4-flash`
  audits the diff against CLAUDE.md + `docs/SECURITY.md` + `docs/full.MD`, emitting
  `REVIEW: PASS — …` / `REVIEW: FAIL — …`.
  - **Inconclusive ≠ FAIL.** When the reviewer can't produce a verdict — empty diff (branch
    merged/deleted, or no changes vs `main`), the agent returns no output, or no verdict
    line — it must emit `REVIEW: SKIP — <reason>` (exit 3), which the watcher renders as a
    neutral ⚠️ "review skipped", NOT a ❌ FAIL with empty findings. A ❌ FAIL is reserved for
    the agent explicitly returning `REVIEW: FAIL` with findings. Empty output gets one retry
    first. (False ❌ on a merged PR with no diff was the symptom that motivated this.)
- **Validate leg** → the `autodev-validate` skill drives the PR's Test Block on
  `hodle-stg.pages.dev` through crabbox, captures screenshot + gif per criterion,
  uploads to R2, and posts the album to Telegram + the PR. Staging-only, no money
  movement.

OpenClaw posts the outcome as a PR comment (see the bus protocol below). It never
merges — a human is the final merge gate.

### Evidence delivery — ALWAYS to BOTH the PR and the Telegram ops chat

Every screenshot / gif / API report goes to **two** places, no exceptions:
1. the **PR** (comment with the R2 URL), and
2. the **OpenClaw Telegram ops chat** (the album the operator actually watches).

This holds even when you validate **manually or locally** (didn't run the full
`capture-crabbox.sh` pipeline) — that path is exactly how evidence silently never
reaches Telegram. If you produced a print by any means, you still deliver it to Telegram:

```bash
# stage media UNDER the workspace — /tmp is REJECTED ("Local media path is not under
# an allowed directory"); only ~/.openclaw/workspace/** is allowed.
ssh root@178.104.175.8 '
  set -a; source /root/.openclaw/workspace/skills/autodev/config.sh; set +a
  WS="$HOME/.openclaw/workspace/cbx-<label>.png"; cp <local-or-r2-file> "$WS"
  openclaw message send --channel "${TG_CHANNEL:-telegram}" \
    --account "${TG_OPS_ACCOUNT:-${TG_ACCOUNT:-agent-hodle}}" \
    --target "${TG_OPS_CHAT:-$TG_CHAT}" \
    --message "🖼️ autodev validate · PR #<n> · <criterion> · <r2 url>" \
    --media "$WS" --json          # do NOT append `|| true` — a failed send must be visible
  rm -f "$WS"'
```

Rules that make this reliable (all learned from a silent miss):
- **Media must live under `~/.openclaw/workspace/**`** — copy it there first; never send a
  `/tmp` path (rejected) or a bare URL as `--media`.
- **Never swallow the send with `|| true`.** Check the `--json` result is `ok:true`; if the
  send fails, surface it in the PR comment + to the user — a swallowed failure reads as
  "delivered" when nothing arrived.
- Text-only status (no print) → `scripts/tg-send.sh "<text>"`. A successful send returns a
  `messageId`; include it when reporting so delivery is verifiable.

---

## Phase 6 — FIX-LOOP (same-session callback via the PR)

This is the core of v5. Instead of spawning a fresh headless coding session in a worktree,
**OpenClaw drives changes back into this same live session through the PR**, and this
session applies them. Keep the session alive with **`ScheduleWakeup`** (~120s) and poll
the PR each tick.

### The command-bus protocol (PR comments)

OpenClaw (or a human operator) posts machine-parseable comments. Each carries a hidden
HTML marker so it is processed exactly once.

| Marker | Posted by | Meaning |
|---|---|---|
| `<!-- autodev:verdict round=N -->` | OpenClaw | `REVIEW: PASS` / `REVIEW: FAIL — <findings>` + `VALIDATE: …` |
| `<!-- autodev:command id=K -->` | OpenClaw / operator | a free-text change request, e.g. `CHANGE: rename CTA "Criar" → "Abrir conta"` |
| `<!-- autodev:ack id=K -->` | this session | confirms a command/verdict was consumed (prevents reprocessing) |

OpenClaw or the operator enqueues a change from the SSH box with plain `gh` — **no
server state**:

```bash
ssh root@178.104.175.8 \
  'gh pr comment <pr> --body "<!-- autodev:command id=3 -->
CHANGE: the empty-state copy still says Liquid; switch it to Spark"'
```

### The poll loop (this session)

1. Pull comments (gh runs on the box, where it is authed):
   ```bash
   ssh root@178.104.175.8 \
     "gh pr view <pr> --json comments -q '.comments[].body'"
   ```
2. Find the newest `autodev:verdict` / `autodev:command` with no matching
   `autodev:ack`.
   - **`verdict` = PASS** (review PASS + validate PASS/skipped) → mark the PR
     `gh pr ready`, report to the user, **end the loop** (omit the next ScheduleWakeup).
   - **`verdict` = FAIL** → read findings, fix in this session, re-run the build gate,
     push, post an `autodev:ack`, re-dispatch Phase 5, schedule the next poll.
   - **`command`** → execute the requested change (edit → build gate → push), post an
     `autodev:ack id=K`, re-dispatch Phase 5, schedule the next poll.
   - **nothing new** → schedule the next poll (`ScheduleWakeup` ~120s).
3. **Bound the loop**: max **3 FAIL rounds**. After 3 consecutive FAILs, stop, post a
   summary comment, and hand the findings to the user. (`command`s from a human don't
   count against the round cap.)

`ScheduleWakeup` keeps the same conversation/context alive between polls, so OpenClaw's
command lands in the session that holds the full plan + blueprint — not a cold worktree.

---

## Validation spec — the `## OpenClaw Test Block`

The validate leg reads this block from the PR body. Write **one** block per PR, derived
from the acceptance criteria. Full step vocabulary lives in
`docs/openclaw/autodev/autodev-validate.SKILL.md`.

**Visual (UI change):**
```markdown
## OpenClaw Test Block
MODE: visual
LABEL: virtual-account-cta
BASE_URL: https://hodle-stg.pages.dev
STEPS:
  - goto: /dashboard/virtual-account
  - shot: "estado-vazio-com-CTA"
  - click: "Criar conta virtual"
  - shot: "modal-aberto"
  - expectAbsent: "Liquid"
  - record: "fluxo-criar-conta"
```

**API (server endpoint change):**
```markdown
## OpenClaw Test Block
MODE: api
LABEL: pixout-disabled-flag
BASE_URL: http://localhost:5666
SPEC:
[ { "name": "blocked when flag on", "method": "POST", "path": "/api/wallet/payout",
    "body": { "value": 100 }, "expectStatus": 403 } ]
```

Validation must **exercise the feature against the backend** (fill real inputs, submit,
`waitText` on a server-confirmed success string) — not screenshot a static page. Specs
are reads / error-paths only: **never money-moving mutations.** Account + secret
prerequisites (the allowlisted `STG_EMAIL`, `STG_PASS`/`STG_PIN`, deploy-staging-first
rule, non-idempotent-flow caveat) are documented in the `autodev-validate` skill.

---

## Hard rules

- Phases gate: no plan before discovery; no execute before the blueprint; no
  `gh pr ready` before a PASS verdict.
- Read files before editing; never edit blind.
- **Automated `vitest` tests are mandatory — a PR without them is incomplete.** Every
  feature ships with `*.spec.ts` covering the flow and asserting that what was asked is
  correct (exact error strings, success path, boundary cases). If the touched area has no
  test, create it; never weaken an assertion to go green. This is distinct from the Phase 5
  `## OpenClaw Test Block` (staging validation) — both are required. Never `gh pr ready`
  with missing or red tests.
- `pnpm -w build && pnpm -w lint` after every change batch — don't accumulate debt.
- Branch off `origin/main`; never share a checkout with unrelated work.
- The PR is the only channel between OpenClaw and this session — no touri-side state.
- Each command/verdict consumed exactly once (`autodev:ack`).
- Max 3 FAIL rounds; then report to the user.
- Staging only, never prod. No money-moving actions in validation.
- **Every print/gif goes to BOTH the PR and the Telegram ops chat** — even for manual/local
  validation. Media staged under `~/.openclaw/workspace/**` (never `/tmp`); verify the send
  returned `ok:true`/`messageId` and never swallow it with `|| true`.
- Never merge — a human is the final gate.
- No emojis in code or commits.
