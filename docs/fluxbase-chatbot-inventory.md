# Fluxbase AI Chatbot Inventory — `wayli/location-assistant`

Single source of truth for the location-assistant chatbot and the Wayli-side
integration points for the **upcoming Fluxbase AI release**. Phase 2 work
(post-release consumption) should reference this file.

> The Fluxbase changes are **not yet released** (RC in progress). Phase 1 =
> prep only; Phase 2 = gated on the SDK bump. See "Phase 2 integration map".

## 1. Chatbot definition

| Field | Value |
|---|---|
| File | `fluxbase/chatbots/location-assistant.ts` |
| Namespace / name | `wayli` / `location-assistant` |
| Version | `2` |
| Response language | English (responds in the user's language; SQL concepts translated to English) |
| Rate limit | `10/min` |
| **Daily limit** | **`500` requests/day** |
| **Token budget** | **`100000` tokens/day** |
| Max tokens / turn | `4096` |
| Temperature | `0.1` |
| Allowed tables | `my_trips`, `my_place_visits`, `my_poi_summary` |
| Allowed operations | `SELECT` on schema `public` |
| MCP tools | `execute_sql`, `http_request`, `vector_search`, `custom:search_visits`, `custom:aggregate_visits`, `custom:get_visit_summary` |
| Knowledge base (RAG) | `wayli-pois` (max 5 chunks, similarity ≥ 0.7) |
| Required settings | `wayli.pelias_endpoint` |
| HTTP-allowed domains | `{{system:wayli.pelias_endpoint}}`, `pelias.wayli.app` |
| System prompt length | ~146 lines (after the slim-down in this branch) |

## 2. Intent rules (12)

Declared via `@fluxbase:intent-rules` in the definition file. Each forces/forbids
a table or tool when a keyword matches.

| # | Keywords | Constraint |
|---|---|---|
| 1 | similar, like this, places like, recommend based on, similar to | `requiredTool: vector_search` |
| 2 | restaurant, cafe, food, eat, dining, bar, pub | `requiredTable: my_place_visits`, `forbiddenTable: my_trips` |
| 3 | museum, gallery, cinema, theatre, exhibition | `requiredTable: my_place_visits`, `forbiddenTable: my_trips` |
| 4 | golf, tennis, gym, sports, fitness, swimming | `requiredTable: my_place_visits`, `forbiddenTable: my_trips` |
| 5 | school, university, college | `requiredTable: my_place_visits`, `forbiddenTable: my_trips` |
| 6 | trip, travel, vacation, journey | `requiredTable: my_trips` |
| 7 | most time, longest, total time, spent time, how long | `requiredTable: my_place_visits` |
| 8 | vegan, vegetarian, halal, kosher, gluten-free, dietary | `requiredTable: my_place_visits` |
| 9 | how many times, how often, frequency, count | `requiredTable: my_place_visits` |
| 10 | how many, count of, total number | (no table constraint — keyword capture only) |
| 11 | places, locations, spots, venues | `requiredTable: my_place_visits`, `forbiddenTable: my_trips` |
| 12 | visited, been to, have I been, did I go, went to | `forbiddenTool: http_request` |

**Tuning note (Phase 2.6):** once `done.matched_intent_rules` telemetry is wired,
review rules that never fire (removal candidates) and queries that should have
fired a rule but didn't (add keywords). See "Analytics gap" below — telemetry is
**not yet wired** on the Wayli side.

## 3. System-prompt templates & prompt caching

**Verified:** the system prompt contains **no per-user templates** (`{{user_id}}`,
`{{user:…}}`). The only template is `{{system:wayli.pelias_endpoint}}`, which is a
constant system setting — identical for every user and every turn.

**Implication for caching:** prompt caching is **unblocked from Wayli's side**. No
prompt restructuring is required. The static prefix (system prompt + tool/schema
definitions) is constant across users; only the per-turn RAG context and the user
message vary, which Fluxbase's prompt-caching work splits into the dynamic part.

## 4. MCP tools & shared code

| Tool | File | Uses shared helpers? |
|---|---|---|
| `search_visits` | `fluxbase/mcp-tools/search-visits.ts` | inline `COUNTRY_MAP` + `parseDateRange` (duplicated) |
| `aggregate_visits` | `fluxbase/mcp-tools/aggregate-visits.ts` | inline `COUNTRY_MAP` + `parseDateRange` (duplicated) |
| `get_visit_summary` | `fluxbase/mcp-tools/get-visit-summary.ts` | no country/date helpers |

**Phase 1 prep:** canonical copies live in `fluxbase/mcp-tools/_shared/countries.ts`
and `_shared/date-range.ts`, covered by Vitest tests under
`web/tests/unit/fluxbase/`. The inline copies in the two tools are **intentionally
retained** (marked with `ponytail:` sync comments) until the Fluxbase CLI supports
`_shared/` bundling.

**Phase 2.4:** swap the inline copies for `import { COUNTRIES } from './_shared/countries.ts'`
and `import { parseDateRange } from './_shared/date-range.ts'`, then
`fluxbase mcp tool sync --namespace wayli --dir ../fluxbase/mcp-tools/` and confirm
bundling output. Test both tools end-to-end against the live DB.

> The duplication is platform-mandated today: MCP tools are synced individually
> with no bundler step, so a relative import would not resolve at runtime until
> the Fluxbase release ships `_shared/` bundling (same convention as edge functions).

## 5. Phase 2 integration map (post-release)

> **Corrected from the original runbook.** The runbook showed reading
> `extras.daily_quota` / `usage.cached_tokens` directly in the page's `onDone`.
> That is wrong for Wayli: there is a **service layer** in between.

### 5.1 SDK baseline
- **Pinned (Phase 2):** `@nimbleflux/fluxbase-sdk@2026.6.3-rc.1` (`web/package.json`,
  exact pin — RC pre-releases don't satisfy caret ranges). Gate-verified all new
  symbols present: `AIMatchedIntentRule`, `AIDailyQuotaSnapshot`, `AIQuota`,
  `client.ai.getUsage()`, `client.ai.lookupChatbot()`, `onDone` 3rd `extras`
  argument, `AIUsageStats.cached_tokens`.
- Live Fluxbase CLI: `fluxbase version` → `2026.6.2` (commit `6b733fd2`), which
  includes the `_shared/` MCP bundling from PR #238.

### 5.2 The real seam: `web/src/lib/services/chat.service.ts`
- `FluxbaseAIChat` is constructed at `chat.service.ts:171`.
- The SDK's callbacks are consumed/wrapped here, **not** in the page:
  - `onQueryResult` → `chat.service.ts:146` (already fires for streamed results).
  - `onDone(usage, conversationId)` → `chat.service.ts:154`, wrapped into a
    `usageStats` object (`promptTokens`/`completionTokens`/`totalTokens`) before
    being passed to the page via `currentCallbacks.onDone`.
- The page (`ask/+page.svelte`) consumes the wrapped `usageStats` + `extras`.

**DONE (Phase 2):** `chat.service.ts` now accepts the SDK's 3rd `extras` arg in
its `onDone` wrapper, forwards `extras.daily_quota` + `extras.matched_intent_rules`
(snake_case → camelCase), adds `cachedTokens` to `UsageStats`, and exposes a
`getDailyUsageForName(name)` helper (resolves the chatbot UUID via
`lookupChatbot` then calls `getUsage`). `ChatCallbacks.onDone` reads
`(usage, extras?)`. New local types: `DailyQuotaSnapshot`, `QuotaUsage`,
`MatchedIntentRule`, `TurnExtras`.

### 5.3 Delete the retry loop — DONE
- **Deleted (Phase 2).** The 3× polling workaround is gone; `onQueryResult` now
  fires reliably for `execute_sql` on Fluxbase 2026.6.3 (PR #238 normalized the
  MCP path to emit `query_result`). Smoke test still pending live deploy: ask a
  question that triggers `execute_sql`; the result must render immediately with
  no "no results" flash and no polling.

### 5.4 Quota UI — DONE
- Initial load: `chatService.getDailyUsageForName('location-assistant')`
  (`lookupChatbot` → `getUsage`) seeds `dailyQuota` in `onMount`.
- Live: `onDone` reads `extras.dailyQuota` each turn.
- States: hidden when no limits / unlimited (`limit = 0`); amber warning at
  ≥ 90 % used; red "Daily limit reached" when exhausted; shows `resets at HH:MM`.
- Token quota is tracked but not shown (requests is the user-facing limit).

### 5.5 Anthropic switch — OPEN DECISION
Fluxbase's native Anthropic provider with explicit `cache_control` yields ≈5-10×
token-cost reduction at steady state (Wayli's 146-line prompt + schema, 100k
token/day budget; cached input billed at 0× against the daily budget on the new
billing, ~0.1× read pricing on Anthropic vs ~0.5× on OpenAI).

Trade-off is real (cost vs quality vs migration risk) and **not pre-decided**. If
the team says go: provision an Anthropic key, create the provider via Fluxbase
admin API, point `location-assistant` at it (default model
`claude-sonnet-4-5-20250929`), run a short eval on 10-20 representative queries,
and verify `usage.cached_tokens > 0` on turn 2+. Roll back if quality regresses.

> Leave `daily-limit`/`token-budget` unchanged when adopting cached-token billing;
> the same 100000 budget goes ~5-10× further, which benefits users directly.

## 6. Analytics gap (telemetry)

**Wayli has no analytics SDK wired into `web/src`.** The runbook's
`analytics.track("intent_rules_fired" …)` / `analytics.track("prompt_cache" …)`
calls therefore have nowhere to go.

**Phase 2 handling (decided):** defer / stub. Consume `daily_quota` in the UI
only; log intent-rule and cache-hit data to `console` as a stub for now. Revisit
when an analytics provider is chosen. Do not block the quota UI on telemetry.

## 7. Verification checklist

**Phase 1 (this branch):**
- [x] `_shared/countries.ts` + `_shared/date-range.ts` extracted
- [x] Vitest tests under `web/tests/unit/fluxbase/`
- [x] Retry-loop comment enriched (deletable-on-release condition named)
- [x] This inventory file

**Phase 2 (consumed on 2026.6.3-rc.1):**
- [x] SDK pinned to `2026.6.3-rc.1`; new types import cleanly; existing tests pass
- [x] `chat.service.ts` `onDone` extended for `extras` + `cached_tokens`
- [x] Retry loop deleted; `execute_sql` results render without polling
- [x] `client.ai.getUsage()` called on Ask page load (via `lookupChatbot`)
- [x] Quota UI live + warning/exhausted/unlimited states
- [x] MCP tools import from `_shared/`; dry-run sync shows bundling output
- [x] Intent-rule + cache-hit telemetry stubbed to `console.debug` (real analytics TBD)
- [ ] **Deploy step (you):** `bun run sync:mcp` to push the bundled tools to the live server, then live smoke-test the chat (quota badge, no retry flash)
- [ ] (If Anthropic) provider created; `cached_tokens > 0` on turn 2+ — **OPEN DECISION**
