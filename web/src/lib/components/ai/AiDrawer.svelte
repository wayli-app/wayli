<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import {
		Send,
		Loader2,
		Plus,
		Copy,
		Check,
		X,
		MessageSquare,
		Trash2,
		Sparkles,
		ChevronRight,
		Brain,
		Wrench,
		Pencil,
		Share2
	} from 'lucide-svelte';
	import {
		ChatService,
		type ChatMessage,
		type AgentThought,
		type UsageStats,
		type DailyQuotaSnapshot
	} from '$lib/services/chat.service';
	import { renderMarkdown } from '$lib/utils/markdown';
	import {
		extractSuggestions as aiExtractSuggestions,
		looksLikeUnparsedProposal as aiLooksLikeUnparsedProposal,
		serializeCurrentPlan as aiSerializeCurrentPlan,
		isSuggestionAlreadyInPlan as aiIsSuggestionAlreadyInPlan
	} from '$lib/utils/ai-suggestions';
	import { translate, currentLocale } from '$lib/i18n';
	import { get } from 'svelte/store';
	import { aiDrawer, type AiPageContext, type PlanSuggestion } from '$lib/stores/ai-drawer';
	import { fade, slide } from 'svelte/transition';
	import { focusTrap } from '$lib/utils/focus-trap';
	import { goto } from '$app/navigation';

	let t = $derived($translate);

	const CHATBOT = 'wayli-assistant';
	const NAMESPACE = 'wayli';

	type Conversation = { id: string; title?: string | null; updated_at?: string };

	type ChatTurn = {
		role: 'user' | 'assistant';
		content: string;
		// Agent reasoning events received while this assistant turn was streaming.
		// Populated only for assistant turns; empty for user turns.
		thoughts?: AgentThought[];
		// Token usage for this turn (populated on onDone). Not restored on reload
		// unless the server returns it in the persisted message.
		usage?: UsageStats;
	};

	let messages = $state<ChatTurn[]>([]);
	let input = $state('');
	let isSending = $state(false);
	let isConnecting = $state(false);
	let connectionError = $state<string | null>(null);
	// Phase 3: live per-user daily quota (seeded on connect, refreshed onDone).
	let dailyQuota = $state<DailyQuotaSnapshot | null>(null);
	// The last user message text, so Retry can resend it after an error.
	let lastUserMsg = $state('');
	// Structured error kind for branching the UI (rate-limited / quota /
	// config / network). Reset on a successful send.
	let errorKind = $state<'rate_limited' | 'quota' | 'config' | 'network' | null>(null);
	let inputEl: HTMLInputElement | null = $state(null);
	let scrollContainer: HTMLElement | null = $state(null);
	// Track which messages have their reasoning panel expanded (keyed by message index).
	// ponytail: Svelte's scoped CSS doesn't see classes inside {#each} loops across
	// <details>, so we toggle a single chevron via state instead of CSS pseudo-selectors.
	let openThoughts = $state<Record<number, boolean>>({});
	let copiedIdx = $state<number | null>(null);

	// Expandable suggestion chips: track which chips are expanded and their edited values
	type SuggestionEdit = {
		day: number;
		time: string | null;
		noTime: boolean;
		cost: number | null;
		currency: string | null;
		type: string;
		address: string | null;
	};
	let expandedChips = $state<Set<string>>(new Set());
	let chipEdits = $state<Record<string, SuggestionEdit>>({});
	let chipAdded = $state<Set<string>>(new Set());
	let chipGeocoding = $state<Set<string>>(new Set());

	let conversations = $state<Conversation[]>([]);
	let showConversationList = $state(false);
	let activeConversationId = $state<string | null>(null);

	// Signature of the last plan context we sent to the model, used to detect
	// when the trip/plan changed mid-conversation so we can re-inject context.
	let lastSentPlanSig = '';

	let chatService: ChatService | null = null;
	// ponytail: pageContext is already reactive ($derived from $aiDrawer).
	// No need for a separate currentCtx snapshot — use pageContext directly in
	// reactive UI ($derived, templates) and read its current value in async
	// callbacks (send, showGreeting) via the closure variable.

	// Reactive: subscribe to drawer store
	let drawerState = $derived($aiDrawer);
	let isOpen = $derived(drawerState.open);
	let pageContext = $derived(drawerState.pageContext);

	// Context badge for the footer
	let contextLabel = $derived(
		pageContext.page === 'plan'
			? `${t('ai.planning')}: ${pageContext.trip_title ?? ''}`
			: pageContext.page === 'statistics'
				? t('ai.context.statistics')
				: pageContext.page === 'trips'
					? t('ai.context.trips')
					: pageContext.page === 'journal'
						? t('ai.context.journal')
						: pageContext.page === 'want-to-visit'
							? t('ai.context.wantToVisit')
							: t('ai.dataAnalysis')
	);

	// Suggestion chips render when there's something to act on: either a
	// registered write handler (plan items, wishlist, …) or a navigate chip
	// (which acts via goto() and needs no handler).
	let canAcceptSuggestions = $derived(
		(pageContext.page === 'plan' && aiDrawer.getAcceptSuggestionHandler() !== null) ||
			aiDrawer.getAcceptHandler('want_to_visit') !== undefined ||
			aiDrawer.getAcceptHandler('journal_draft') !== undefined
	);

	$effect(() => {
		// ponytail: touch pageContext so this $effect tracks it for any future
		// side effects (logging, analytics). Currently a no-op but keeps the
		// dependency graph explicit.
		void pageContext;
	});

	onMount(async () => {
		chatService = new ChatService();
		await loadConversations();
	});

	// Focus the input when the drawer opens, and refocus after each send
	$effect(() => {
		if (isOpen) {
			// small delay so the transition can mount the input first
			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	$effect(() => {
		// ponytail: touch messages.length so this re-runs after every send;
		// refocus the input once the assistant reply starts streaming.
		void messages.length;
		if (isOpen && !isConnecting) {
			requestAnimationFrame(() => inputEl?.focus());
		}
	});

	onDestroy(() => {
		chatService?.disconnect();
	});

	async function loadConversations() {
		if (!chatService) return;
		try {
			const result = await chatService.listConversations({
				chatbot: CHATBOT,
				namespace: NAMESPACE
			});
			conversations = result.conversations ?? [];
		} catch (err) {
			console.warn('Failed to load conversations:', err);
		}
	}

	async function ensureConnected() {
		if (!chatService) return false;
		if (chatService.isConnected()) return true;
		isConnecting = true;
		connectionError = null;
		try {
			await chatService.connect({
				onContent: (_delta, full) => {
					const lastIdx = messages.length - 1;
					if (messages[lastIdx]?.role === 'assistant') {
						messages[lastIdx].content = full;
						messages = [...messages];
						scrollToBottom();
					}
				},
				onAgentThought: (thought) => {
					// ponytail: append directly to the in-flight assistant message so
					// the reasoning panel updates live (collapsed by default — user
					// expands to watch the thought process as it streams in).
					const lastIdx = messages.length - 1;
					if (messages[lastIdx]?.role === 'assistant') {
						messages[lastIdx].thoughts = [...(messages[lastIdx].thoughts ?? []), thought];
						messages = [...messages];
						// Auto-scroll only if the user has expanded the panel for this
						// message; otherwise let it accumulate silently.
						if (openThoughts[lastIdx]) scrollToBottom();
					}
				},
				onDone: (usage, extras) => {
					isSending = false;
					errorKind = null;
					// Phase 3.1: capture per-turn usage + live quota. The service
					// already maps these from snake_case; we just store them.
					if (usage) {
						const lastIdx = messages.length - 1;
						if (messages[lastIdx]?.role === 'assistant') {
							messages[lastIdx].usage = usage;
							messages = [...messages];
						}
					}
					if (extras?.dailyQuota) {
						dailyQuota = extras.dailyQuota;
					}
				},
				onError: (error: any, code?: string) => {
					console.error('Chat error:', error, code);
					// Phase 3.2: branch by code so the user gets an actionable
					// message instead of a generic "something went wrong".
					const c = (code ?? '').toLowerCase();
					if (c.includes('rate') || c === 'rate_limited' || c === '429') {
						errorKind = 'rate_limited';
					} else if (
						c.includes('quota') ||
						c.includes('daily') ||
						c.includes('limit') ||
						c === 'daily_limit_exceeded'
					) {
						errorKind = 'quota';
					} else if (
						c.includes('config') ||
						c.includes('provider') ||
						c.includes('not_configured')
					) {
						errorKind = 'config';
					} else {
						errorKind = 'network';
					}
					const lastIdx = messages.length - 1;
					if (messages[lastIdx]?.role === 'assistant') {
						const msg =
							errorKind === 'rate_limited'
								? t('ai.rateLimited')
								: errorKind === 'quota'
									? t('ai.quota.exceeded', { time: formatResetsAt() })
									: errorKind === 'config'
										? t('ai.configError')
										: t('ai.error');
						messages[lastIdx].content = msg;
						messages = [...messages];
					}
					isSending = false;
				}
			});
			// Seed quota for the first turn (live updates arrive via onDone).
			chatService
				.getDailyUsageForName(CHATBOT)
				.then((q) => {
					dailyQuota = q;
				})
				.catch(() => {});
			isConnecting = false;
			return true;
		} catch (err: any) {
			connectionError = err?.message ?? String(err);
			isConnecting = false;
			return false;
		}
	}

	// Human-friendly "in 3 hours" style for the quota reset timestamp.
	function formatResetsAt(): string {
		const ts = dailyQuota?.resetsAt;
		if (!ts) return '';
		try {
			const d = new Date(ts);
			const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
			const diffMs = d.getTime() - Date.now();
			const diffH = Math.round(diffMs / 3_600_000);
			if (Math.abs(diffH) >= 1) return rtf.format(diffH, 'hour');
			const diffM = Math.round(diffMs / 60_000);
			return rtf.format(diffM, 'minute');
		} catch {
			return ts;
		}
	}

	async function startNewConversation() {
		if (!chatService) return;
		const ok = await ensureConnected();
		if (!ok) return;
		try {
			const newId = await chatService.startChat(CHATBOT, NAMESPACE);
			activeConversationId = newId;
			messages = [];
			showGreeting();
		} catch (err: any) {
			connectionError = err?.message ?? String(err);
		}
	}

	async function loadConversation(convoId: string) {
		if (!chatService) return;
		const ok = await ensureConnected();
		if (!ok) return;
		try {
			await chatService.startChat(CHATBOT, NAMESPACE, convoId);
			const convo = await chatService.getConversation(convoId);
			activeConversationId = convoId;
			if (convo?.messages && Array.isArray(convo.messages)) {
				messages = convo.messages
					.map((m: any) => {
						const turn: ChatTurn = {
							role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
							content: String(m.content ?? m.text ?? '')
						};
						// Phase 3.3: restore per-turn usage if the server persisted it.
						if (m.usage && (m.usage.prompt_tokens || m.usage.completion_tokens)) {
							turn.usage = {
								promptTokens: m.usage.prompt_tokens ?? 0,
								completionTokens: m.usage.completion_tokens ?? 0,
								totalTokens: m.usage.total_tokens
							};
						}
						return turn;
					})
					.filter((m) => m.content);
				scrollToBottom();
			}
			showConversationList = false;
		} catch (err: any) {
			console.error('Failed to load conversation:', err);
		}
	}

	async function deleteConversation(convoId: string) {
		if (!chatService) return;
		try {
			await chatService.deleteConversation(convoId);
			conversations = conversations.filter((c) => c.id !== convoId);
			if (activeConversationId === convoId) {
				activeConversationId = null;
				messages = [];
				showGreeting();
			}
		} catch (err) {
			console.error('Failed to delete conversation:', err);
		}
	}

	function showGreeting() {
		if (messages.length > 0) return;
		const inPlanMode = pageContext.page === 'plan';
		const tripTitle = pageContext.trip_title;
		const numDays = pageContext.num_days;
		const primaryCity = pageContext.primary_city;
		const destination = primaryCity || tripTitle;

		if (inPlanMode && destination) {
			messages = [
				{
					role: 'assistant',
					content:
						numDays != null
							? t('ai.planGreetingDays', { destination, days: numDays })
							: t('ai.planGreeting', { destination })
				}
			];
		} else {
			messages = [
				{
					role: 'assistant',
					content: t('ai.greeting')
				}
			];
		}
	}

	function scrollToBottom() {
		requestAnimationFrame(() => {
			if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
		});
	}

	function copyMessage(idx: number) {
		const msg = messages[idx];
		if (!msg) return;
		navigator.clipboard.writeText(msg.content);
		copiedIdx = idx;
		setTimeout(() => (copiedIdx = null), 2000);
	}

	let shareOpen = $state(false);
	let shareText = $state('');
	let shareCopied = $state(false);

	function buildShareTranscript(): string {
		const lines: string[] = [
			'# AI Assistant conversation transcript',
			``,
			`- Chatbot: ${CHATBOT}`,
			`- Namespace: ${NAMESPACE}`,
			`- Page context: ${JSON.stringify(pageContext, null, 2)}`,
			`- Generated: ${new Date().toISOString()}`,
			``,
			`---`,
			``
		];
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			lines.push(`## ${m.role === 'user' ? 'User' : 'Assistant'} (${i})`);
			lines.push(``);
			lines.push(m.content);
			lines.push(``);
			// Phase 3.4: include per-turn token usage when available — invaluable
			// for debugging cost/quota issues from a shared transcript.
			if (m.usage) {
				lines.push(
					`> usage: prompt=${m.usage.promptTokens} completion=${m.usage.completionTokens}` +
						(m.usage.totalTokens != null ? ` total=${m.usage.totalTokens}` : '') +
						(m.usage.cachedTokens ? ` cached=${m.usage.cachedTokens}` : '')
				);
				lines.push(``);
			}
			if (m.thoughts && m.thoughts.length > 0) {
				lines.push(`<details><summary>Reasoning events (${m.thoughts.length})</summary>`);
				lines.push(``);
				for (const th of m.thoughts) {
					lines.push(`- **agent=${th.agent} kind=${th.kind}**`);
					if (th.tool_name) lines.push(`  - tool: ${th.tool_name}`);
					if (th.tool_args != null) lines.push(`  - args: ${JSON.stringify(th.tool_args)}`);
					if (th.delta) lines.push(`  - delta: ${th.delta}`);
					if (th.plan) {
						lines.push(`  - plan:`);
						lines.push(`    - route: ${th.plan.route?.join(' → ') ?? '-'}`);
						if (th.plan.sub_questions?.length) {
							lines.push(`    - sub_questions:`);
							for (const q of th.plan.sub_questions) lines.push(`      - ${q}`);
						}
						lines.push(
							`    - requires_synthesis=${th.plan.requires_synthesis} is_investigative=${th.plan.is_investigative} min_tool_calls=${th.plan.min_tool_calls}`
						);
					}
				}
				lines.push(``);
				lines.push(`</details>`);
				lines.push(``);
			}
		}
		if (connectionError) {
			lines.push(`## Connection error`);
			lines.push(``);
			lines.push('```');
			lines.push(connectionError);
			lines.push('```');
		}
		if (errorKind) {
			lines.push(`## Error kind: ${errorKind}`);
			lines.push(``);
		}
		if (dailyQuota) {
			lines.push(`## Daily quota snapshot`);
			lines.push(``);
			lines.push('```json');
			lines.push(JSON.stringify(dailyQuota, null, 2));
			lines.push('```');
		}
		return lines.join('\n');
	}

	function openSharePanel() {
		shareText = buildShareTranscript();
		shareOpen = true;
	}

	function copyShareText() {
		navigator.clipboard.writeText(shareText);
		shareCopied = true;
		setTimeout(() => (shareCopied = false), 2000);
	}

	function downloadShareText() {
		const blob = new Blob([shareText], { type: 'text/markdown' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `ai-conversation-${new Date().toISOString().split('T')[0]}.md`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	// Suggestion parsing for plan mode (ported from TripPlannerChat). The pure
	// helpers live in $lib/utils/ai-suggestions.ts (unit-tested there); this
	// component keeps only the markdown bullet parser, which needs page context.
	type ParsedSuggestion = PlanSuggestion;

	function extractSuggestions(content: string): ParsedSuggestion[] {
		return aiExtractSuggestions(content, extractFromBullets);
	}

	// Whether a turn *looks* like it proposed plan items but failed to parse
	// (a fence present, or bolded bullets) — used to show a visible error.
	function looksLikeUnparsedProposal(content: string, parsed: ParsedSuggestion[]): boolean {
		return aiLooksLikeUnparsedProposal(content, parsed, canAcceptSuggestions);
	}

	// ponytail: bullet-point parser — extracts suggestions from the markdown
	// the model naturally produces even when it ignores JSON formatting rules.
	// Handles: ### Day N headings, - **Title** — desc, - Title: desc, N. **Title**
	function extractFromBullets(content: string): ParsedSuggestion[] {
		// Only parse in plan mode — don't produce chips for data-analysis responses
		if (pageContext.page !== 'plan') return [];

		const suggestions: ParsedSuggestion[] = [];
		let currentDay = 1;
		const seen = new Set<string>();

		for (const line of content.split('\n')) {
			// Track day from ### Day N: headings OR **Day N:** bold headers
			const dayMatch = line.match(/^(?:#{1,4}\s+|\*\*)\s*.*?\bDay\s+(\d+)\b/i);
			if (dayMatch) {
				currentDay = parseInt(dayMatch[1], 10);
				continue;
			}

			// Match bullet points: - text, * text, or N. text
			const bullet = line.match(/^\s*[-*]\s+(.+)|^\s*\d+\.\s+(.+)/);
			if (!bullet) continue;

			const rawText = (bullet[1] || bullet[2] || '').trim();
			if (!rawText || rawText.length < 4) continue;

			// Skip obvious non-activity lines
			if (/^(quick question|if you|do you|what's|what is|tell me|note:|tip:)/i.test(rawText))
				continue;

			// Extract title from **bold** or before separator
			let title = '';
			let desc = '';
			let timeHint = '';

			// Pattern: **Title** — description  OR  **Title** - description
			const boldMatch = rawText.match(/^\*\*(.+?)\*\*\s*[—–-]?\s*(.*)/);
			if (boldMatch) {
				title = boldMatch[1].trim();
				desc = boldMatch[2] || '';
			} else {
				// Pattern: TimeWord: Activity  (e.g., "Morning: Brandenburg Gate")
				const timePrefix = rawText.match(
					/^(morning|afternoon|evening|lunch|dinner|midday|noon|early|late|night|sunrise|sunset)\s*[:—–-]\s*(.+)/i
				);
				if (timePrefix) {
					timeHint = timePrefix[1].toLowerCase();
					// The activity after the colon — take first item if comma-separated
					const activities = timePrefix[2].split(/[,;]/)[0].trim();
					// Check if the activity itself is bold
					const innerBold = activities.match(/^\*\*(.+?)\*\*/);
					title = innerBold ? innerBold[1].trim() : activities;
					desc = timePrefix[2];
				} else {
					// Pattern: Title — description  OR  Title: description
					const sep = rawText.match(/^(.+?)\s*[—–-]\s+(.+)/);
					if (sep) {
						title = sep[1].replace(/\*\*/g, '').trim();
						desc = sep[2];
					} else {
						title = rawText.replace(/\*\*/g, '').trim();
					}
				}
			}

			// Clean up title: strip bold markers, trailing colons/semicolons, whitespace
			title = title
				.replace(/^\*\*/, '')
				.replace(/\*\*$/, '')
				.replace(/[:：]\s*$/, '')
				.trim();
			if (!title || title.length < 3) continue;

			// Dedupe by title (case-insensitive)
			const titleKey = title.toLowerCase().slice(0, 40);
			if (seen.has(titleKey)) continue;
			seen.add(titleKey);

			suggestions.push({
				day: currentDay,
				title,
				type: inferType(title, desc),
				time: timeHint ? inferTime(timeHint) : null,
				cost: null,
				currency: null,
				address: null
			});
		}

		// Cap at 15 to avoid flooding the chat with chips
		return suggestions.slice(0, 15);
	}

	function inferType(title: string, desc: string): string {
		const t = (title + ' ' + desc).toLowerCase();
		if (
			/museum|gallery|cathedral|church|memorial|monument|castle|palace|reichstag|brandenburg|wall|history|heritage|exhibition/.test(
				t
			)
		)
			return 'sightseeing';
		if (
			/restaurant|café|cafe|food|lunch|dinner|brunch|eat|curry|döner|doner|market|beer|bar|biergarten|brewery|cocktail|wine/.test(
				t
			)
		)
			return 'food';
		if (/train|bus|flight|boat|cruise|bike|cycle|transport|airport|ferry|tram/.test(t))
			return 'transport';
		if (/hotel|hostel|accommodation|stay|check.?in/.test(t)) return 'accommodation';
		if (/park|garden|walk|stroll|picnic|relax|tiergarten|tempelhofer/.test(t)) return 'rest';
		if (/shop|shopping|mall|store|boutique/.test(t)) return 'shopping';
		return 'activity';
	}

	function inferTime(prefix: string): string | null {
		const p = prefix.toLowerCase();
		if (/morning|early/.test(p)) return '09:00';
		if (/lunch|midday|noon/.test(p)) return '12:00';
		if (/afternoon/.test(p)) return '14:00';
		if (/evening|dinner|sunset|night/.test(p)) return '18:00';
		return null;
	}

	function stripJsonBlocks(content: string): string {
		return content.replace(/```json\s*\n?(\[[\s\S]*?\])\s*\n?```/g, '').trim();
	}

	// Phase 1.2: serialize the current plan items into a compact context block
	// so the model has real item_ids for update/delete suggestions without a
	// get-trip-plan RPC round-trip on every turn. Returns '' when there are no
	// items, so empty plans don't add noise. The plan page sets
	// current_plan_items in the ai-drawer store; we only re-send when the set
	// of item ids changes (tracked by the caller via planSig for the trip, and
	// here by a separate signature so intra-trip edits are captured).
	function serializeCurrentPlan(items: unknown): string {
		return aiSerializeCurrentPlan(items);
	}

	// Phase 1.4: a create suggestion is "already added" if its title+day match
	// an item in the current plan — so reloaded conversations can't double-add.
	// Update/delete suggestions match by item_id.
	function isSuggestionAlreadyInPlan(sug: ParsedSuggestion): boolean {
		return aiIsSuggestionAlreadyInPlan(sug, pageContext.current_plan_items);
	}

	// ponytail: intercept clicks on links inside rendered assistant messages so
	// internal app links use SPA navigation (goto) instead of a full page reload.
	// External links are left to the browser (open in a new tab). The markdown
	// renderer is shared with the journal, so we handle this at the container
	// level via event delegation rather than modifying the shared util.
	function handleLinkClick(e: MouseEvent) {
		const target = e.target as HTMLElement | null;
		const anchor = target?.closest('a');
		if (!anchor) return;
		const href = anchor.getAttribute('href');
		if (!href) return;
		// Only intercept internal path links (not mailto/tel/external/http(s)).
		if (href.startsWith('/') && !href.startsWith('//')) {
			e.preventDefault();
			goto(href);
		}
	}

	async function onAcceptSuggestion(sug: ParsedSuggestion) {
		// Navigate suggestions open an in-app route directly (no handler needed);
		// everything else dispatches to the registered per-target handler.
		if (sug.target === 'navigate' && sug.href) {
			goto(sug.href);
			return;
		}
		const handler = aiDrawer.getHandlerForSuggestion(sug);
		if (!handler) return;
		await handler(sug);
	}

	// === Expandable suggestion chips ===

	function chipKey(msgIdx: number, sugIdx: number): string {
		return `${msgIdx}-${sugIdx}`;
	}

	function toggleChip(key: string, sug: ParsedSuggestion) {
		if (expandedChips.has(key)) {
			expandedChips.delete(key);
			expandedChips = new Set(expandedChips);
		} else {
			expandedChips = new Set([...expandedChips, key]);
			// Initialize edit state from the AI suggestion
			if (!chipEdits[key]) {
				chipEdits[key] = {
					day: sug.day ?? 1,
					time: sug.time ?? null,
					noTime: !sug.time,
					cost: sug.cost ?? null,
					currency: sug.currency ?? null,
					type: sug.type ?? 'activity',
					address: sug.address ?? null
				};
			}
			// Background geocode if address exists but no coordinates
			if (sug.address && !chipGeocoding.has(key)) {
				chipGeocoding = new Set([...chipGeocoding, key]);
				geocodeAddress(sug.address).then(() => {
					chipGeocoding.delete(key);
					chipGeocoding = new Set(chipGeocoding);
				});
			}
		}
	}

	async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
		try {
			const { getPeliasEndpoint } = await import('$lib/services/external/pelias.service');
			const endpoint = await getPeliasEndpoint();
			const res = await fetch(`${endpoint}/v1/search?text=${encodeURIComponent(address)}&size=1`, {
				headers: { Accept: 'application/json' }
			});
			const data = await res.json();
			const feat = data.features?.[0];
			if (feat?.geometry?.coordinates) {
				return { lat: feat.geometry.coordinates[1], lng: feat.geometry.coordinates[0] };
			}
		} catch {
			// best-effort
		}
		return null;
	}

	async function confirmAddChip(key: string, sug: ParsedSuggestion) {
		const edit = chipEdits[key];
		if (!edit) return;
		const modified: ParsedSuggestion = {
			...sug,
			day: edit.day,
			time: edit.noTime ? null : edit.time,
			cost: edit.cost,
			currency: edit.currency,
			type: edit.type,
			address: edit.address
		};
		await onAcceptSuggestion(modified);
		chipAdded = new Set([...chipAdded, key]);
		expandedChips.delete(key);
		expandedChips = new Set(expandedChips);
	}

	async function send() {
		if (!input.trim() || isSending) return;
		const ok = await ensureConnected();
		if (!ok) return;

		const userMsg = input.trim();
		lastUserMsg = userMsg;
		input = '';
		isSending = true;

		// Lazily start a new conversation if none is active
		if (!activeConversationId) {
			try {
				activeConversationId = await chatService!.startChat(CHATBOT, NAMESPACE);
			} catch (err: any) {
				connectionError = err?.message ?? String(err);
				isSending = false;
				return;
			}
		}

		// ponytail: pageContext is a STRING identifier (e.g. 'plan') that the
		// supervisor uses to look up a PageProfile. Trip context data has to
		// travel in the message body because pageContext is not an object.
		//
		// Context is injected on EVERY turn (not just the first message) so the
		// model never drifts: user_language is always sent to prevent the
		// documented bug where it reverts to the trip-title's language, and the
		// full TRIP CONTEXT block is re-sent whenever the underlying trip/cities
		// change (switching trips mid-conversation) so the model stays accurate.
		const userMsgCount = messages.filter((m) => m.role === 'user').length;
		const isFirstUserMessage = userMsgCount === 0;
		const inPlanMode = pageContext.page === 'plan';
		const userLang = (get(currentLocale) as string) || 'en';

		// Signature of the plan context; if it changed since the last send we
		// re-inject the full block instead of a compact hint.
		const planSig = [
			pageContext.trip_id ?? '',
			pageContext.trip_title ?? '',
			pageContext.num_days ?? '',
			pageContext.primary_city ?? '',
			pageContext.home_city ?? ''
		].join('|');
		const contextChanged = planSig !== lastSentPlanSig;
		const fullContextNeeded = isFirstUserMessage || (inPlanMode && contextChanged);

		const headers: string[] = [];
		if (inPlanMode) {
			const tripBlock = [
				`[TRIP CONTEXT]`,
				`trip_id=${pageContext.trip_id ?? ''}`,
				`trip_title=${pageContext.trip_title ?? ''}`,
				`start=${pageContext.trip_dates?.start ?? ''}`,
				`end=${pageContext.trip_dates?.end ?? ''}`,
				`num_days=${pageContext.num_days ?? ''}`,
				`primary_city=${pageContext.primary_city ?? ''}`,
				`home_city=${pageContext.home_city ?? ''}`,
				`user_language=${userLang}`
			].join('; ');
			// Full block on first message or when context changed; compact hint
			// otherwise (the conversation already has the static fields).
			headers.push(
				fullContextNeeded
					? tripBlock
					: `[TRIP] trip_id=${pageContext.trip_id ?? ''}; user_language=${userLang}`
			);
			// Phase 1.2: inject the current plan so the model can emit
			// update/delete suggestions with real item_ids without a round-trip
			// to the get-trip-plan RPC. Only when changed & non-empty.
			const planBlock = serializeCurrentPlan(pageContext.current_plan_items);
			if (planBlock) headers.push(planBlock);
		} else if (isFirstUserMessage) {
			// First message on a non-plan page: minimal lang hint.
			headers.push(`[LANG] user_language=${userLang}`);
		} else {
			// Subsequent non-plan turns: still keep the language pinned so the
			// model doesn't drift back to the conversation/history language.
			headers.push(`[LANG] user_language=${userLang}`);
		}
		lastSentPlanSig = planSig;

		const msgToSend = headers.length ? `${headers.join('\n')}\n\n${userMsg}` : userMsg;

		messages = [...messages, { role: 'user', content: userMsg }];
		messages = [...messages, { role: 'assistant', content: '...' }];
		scrollToBottom();

		try {
			await chatService!.sendMessage(
				msgToSend,
				undefined,
				pageContext.page // 'default' | 'plan'
			);
			// Refresh conversation list after first successful turn
			if (conversations.length === 0 || conversations[0]?.id !== activeConversationId) {
				loadConversations();
			}
		} catch (err: any) {
			console.error('Send failed:', err);
			messages = [
				...messages.filter((m) => m.content !== '...'),
				{ role: 'assistant', content: t('ai.connectionError') }
			];
			isSending = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}

	// Retry the last message after a transient (network) error: drop the error
	// bubble, restore the message into the input, and resend.
	async function retryLast() {
		if (!lastUserMsg || isSending) return;
		// Remove the trailing error assistant message so the retry reads cleanly.
		messages = messages.filter(
			(m, idx) =>
				!(
					idx === messages.length - 1 &&
					m.role === 'assistant' &&
					(m.content === t('ai.error') ||
						m.content === t('ai.connectionError') ||
						m.content === t('ai.rateLimited'))
				)
		);
		errorKind = null;
		input = lastUserMsg;
		await send();
	}

	// Whether the input should be disabled (quota/rate-limit hit — no point
	// letting the user type until the window resets).
	let inputDisabled = $derived(
		isSending || isConnecting || errorKind === 'quota' || errorKind === 'rate_limited'
	);

	// Suggestion chips for empty state — page-aware where possible so the
	// prompt reflects the surface the user is on rather than only generic
	// history questions.
	const dataSuggestions = [
		() => t('ai.suggestions.countries'),
		() => t('ai.suggestions.recentTrips'),
		() => t('ai.suggestions.cities'),
		() => t('ai.suggestions.tripCount')
	];

	const planSuggestions = $derived([
		t('ai.suggestions.planItinerary', {
			city: pageContext.primary_city || pageContext.trip_title || 'this trip'
		}),
		t('ai.suggestions.planRestaurants'),
		t('ai.suggestions.planFree')
	]);

	// ponytail: per-surface prompts. These seed the assistant with the current
	// screen in mind (statistics spike, trip summary, …). Falls back to the
	// generic data-analysis chips for unknown pages.
	const pageSuggestions = $derived.by<string[]>(() => {
		switch (pageContext.page) {
			case 'statistics':
				return [
					t('ai.suggestions.statsSpike'),
					t('ai.suggestions.statsTopMode'),
					t('ai.suggestions.statsSummary')
				];
			case 'trips':
				return [
					t('ai.suggestions.tripsSummary'),
					t('ai.suggestions.tripsDraft'),
					t('ai.suggestions.countries')
				];
			case 'journal':
				return [t('ai.suggestions.journalRecent'), t('ai.suggestions.cities')];
			default:
				return dataSuggestions.map((f) => f());
		}
	});

	function useSuggestion(text: string) {
		input = text;
		send();
	}
</script>

{#if isOpen}
	<!-- Backdrop (mobile only) -->
	<button
		type="button"
		class="fixed inset-0 z-40 bg-black/50 md:hidden"
		aria-label="Close AI drawer"
		onclick={() => aiDrawer.close()}
		transition:fade={{ duration: 150 }}
	></button>

	<!-- Drawer -->
	<aside
		use:focusTrap={true}
		class="bg-card border-border fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l shadow-2xl md:w-[28rem] lg:w-[32rem]"
		transition:slide={{ duration: 250 }}
	>
		<!-- Header -->
		<header class="border-border flex items-center justify-between border-b p-3">
			<div class="flex items-center gap-2">
				<Sparkles class="text-primary h-4 w-4" />
				<h2 class="text-foreground text-sm font-semibold">{t('ai.title')}</h2>
				<span class="text-muted-foreground text-xs">·</span>
				<span class="text-muted-foreground truncate text-xs">{contextLabel}</span>
			</div>
			<div class="flex items-center gap-1">
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5"
					title={t('ai.conversations')}
					onclick={() => (showConversationList = !showConversationList)}
				>
					<MessageSquare class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5"
					title={t('ai.share')}
					onclick={openSharePanel}
				>
					<Share2 class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5"
					title={t('ai.newConversation')}
					onclick={startNewConversation}
				>
					<Plus class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1.5"
					title={t('common.actions.close')}
					onclick={() => aiDrawer.close()}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</header>

		<!-- Conversation list (collapsible) -->
		{#if showConversationList}
			<div class="border-border max-h-64 overflow-y-auto border-b">
				{#if conversations.length === 0}
					<p class="text-muted-foreground px-4 py-3 text-xs">{t('ai.noConversations')}</p>
				{:else}
					<ul>
						{#each conversations as convo (convo.id)}
							<li
								class="border-border flex items-center gap-2 border-b px-3 py-2 text-sm last:border-0 {activeConversationId ===
								convo.id
									? 'bg-muted'
									: 'hover:bg-muted/50'}"
							>
								<button
									type="button"
									class="flex-1 text-left"
									onclick={() => loadConversation(convo.id)}
								>
									<div class="text-foreground truncate text-xs font-medium">
										{convo.title || t('ai.untitled')}
									</div>
									{#if convo.updated_at}
										<div class="text-muted-foreground text-[10px]">
											{new Date(convo.updated_at).toLocaleDateString()}
										</div>
									{/if}
								</button>
								<button
									type="button"
									class="text-muted-foreground hover:text-destructive p-1"
									title={t('common.actions.delete')}
									onclick={() => deleteConversation(convo.id)}
								>
									<Trash2 class="h-3 w-3" />
								</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}

		<!-- Configuration error banner -->
		{#if connectionError}
			<div class="border-border bg-destructive/10 border-b px-4 py-2 text-xs">
				<p class="text-destructive font-medium">{t('ai.configError')}</p>
				<p class="text-muted-foreground">{connectionError}</p>
			</div>
		{/if}

		<!-- Phase 3: daily quota strip (only when a limit is configured). -->
		{#if dailyQuota && (dailyQuota.requests.limit > 0 || dailyQuota.tokens.limit > 0)}
			{@const reqNear =
				dailyQuota.requests.limit > 0 &&
				dailyQuota.requests.used / dailyQuota.requests.limit >= 0.8}
			<div
				class="border-border flex items-center justify-between gap-2 border-b px-4 py-1.5 text-[10px] {reqNear
					? 'bg-amber-500/10'
					: ''}"
				title={dailyQuota.resetsAt ? t('ai.quota.resetsAt', { time: formatResetsAt() }) : ''}
			>
				<span class="text-muted-foreground">
					{#if dailyQuota.requests.limit > 0}
						{t('ai.quota.requests', {
							used: dailyQuota.requests.used,
							limit: dailyQuota.requests.limit
						})}
					{/if}
				</span>
				<span class="text-muted-foreground">
					{#if dailyQuota.tokens.limit > 0}
						{t('ai.quota.tokens', { used: dailyQuota.tokens.used, limit: dailyQuota.tokens.limit })}
					{:else}
						{t('ai.quota.unlimited')}
					{/if}
				</span>
			</div>
		{/if}

		<!-- Phase 3.2: actionable error banner (retry on transient errors). -->
		{#if errorKind === 'network' || errorKind === 'rate_limited'}
			<div
				class="border-border flex items-center justify-between gap-2 border-b bg-amber-500/10 px-4 py-2 text-xs"
			>
				<span class="text-amber-700 dark:text-amber-300">
					{errorKind === 'rate_limited' ? t('ai.rateLimited') : t('ai.connectionError')}
				</span>
				<button
					type="button"
					class="rounded px-2 py-0.5 text-[11px] font-medium underline-offset-2 hover:bg-amber-500/20 hover:underline"
					onclick={retryLast}
				>
					{t('ai.retry')}
				</button>
			</div>
		{/if}

		<!-- Messages -->
		<div bind:this={scrollContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
			{#if messages.length === 0 && !isConnecting}
				<!-- Empty state with suggestions -->
				<div class="space-y-3">
					<p class="text-muted-foreground text-sm">{t('ai.emptyState')}</p>
					<div class="flex flex-wrap gap-2">
						{#each pageContext.page === 'plan' ? planSuggestions : pageSuggestions as suggestion}
							<button
								type="button"
								class="border-border hover:bg-muted hover:border-primary/40 rounded-full border px-3 py-1.5 text-xs transition-colors"
								onclick={() => useSuggestion(suggestion)}
							>
								{suggestion}
							</button>
						{/each}
					</div>
				</div>
			{:else}
				{#each messages as msg, i (i)}
					{#if msg.role === 'user'}
						<div class="flex justify-end">
							<div
								class="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-sm whitespace-pre-wrap"
							>
								{msg.content}
							</div>
						</div>
					{:else}
						{@const rawSuggestions = extractSuggestions(msg.content)}
						{@const suggestions = rawSuggestions.filter(
							(s) => s.target === 'navigate' || aiDrawer.getHandlerForSuggestion(s) !== undefined
						)}
						{@const displayContent = stripJsonBlocks(msg.content)}
						{@const hasThoughts = (msg.thoughts?.length ?? 0) > 0}
						<div class="flex justify-start">
							<div class="max-w-[90%]">
								{#if hasThoughts}
									<!-- Auto-collapsed reasoning (supervisor mode). ponytail: <details>
								     is the smallest collapse UI; default closed so the chat stays readable.
								     Single chevron rotates via state because Svelte scoped CSS can't see
								     classes inside {#each} across <details>. -->
									<details
										class="border-border mb-1 rounded-md border text-[11px]"
										open={false}
										ontoggle={(e) => {
											openThoughts = {
												...openThoughts,
												[i]: (e.currentTarget as HTMLDetailsElement).open
											};
										}}
									>
										<summary
											class="text-muted-foreground hover:bg-muted flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-[10px]"
										>
											<Brain class="h-3 w-3" />
											{t('ai.reasoning', { count: msg.thoughts!.length })}
											{#if msg.thoughts?.find((th) => th.plan?.route?.length)?.plan?.route}
												{@const route = msg.thoughts!.find((th) => th.plan?.route?.length)!.plan!
													.route!}
												{@const usedWeb = route.includes('web')}
												{@const webToolCalled = msg.thoughts?.some(
													(th) => th.kind === 'tool_call' && th.tool_name === 'web_search'
												)}
												<span
													class="bg-muted text-foreground ml-1 inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium"
													title="Agents the supervisor routed to this turn"
												>
													{#each route as agent, ri (agent)}
														{#if ri > 0}<span class="opacity-40">→</span>{/if}
														<span>{agent}</span>
													{/each}
												</span>
												<span
													class="ml-0.5 inline-flex items-center gap-0.5 text-[9px] {usedWeb
														? webToolCalled
															? 'text-green-600 dark:text-green-400'
															: 'text-amber-600 dark:text-amber-400'
														: ''}"
													title={usedWeb
														? webToolCalled
															? 'Web agent ran and searched'
															: 'Web agent was routed but did not search (check audit log / Tavily key)'
														: ''}
												>
													{#if usedWeb}{webToolCalled ? '🔍' : '⚠️'}{/if}
												</span>
											{/if}
											<ChevronRight
												class="ml-auto h-3 w-3 transition-transform {openThoughts[i]
													? 'rotate-90'
													: ''}"
											/>
										</summary>
										<div class="border-border space-y-1 border-t px-2 py-1.5">
											{#each msg.thoughts as thought, thoughtIdx (thoughtIdx)}
												<div class="text-muted-foreground flex items-start gap-1.5">
													{#if thought.kind === 'tool_call'}
														<Wrench class="mt-0.5 h-3 w-3 flex-shrink-0" />
														<div class="min-w-0 flex-1">
															<span class="text-foreground font-medium">{thought.tool_name}</span>
															{#if thought.tool_args != null}
																<code
																	class="block text-[10px] break-all whitespace-pre-wrap opacity-70"
																	>{JSON.stringify(thought.tool_args)}</code
																>
															{/if}
														</div>
													{:else if thought.kind === 'plan' && thought.plan}
														<Sparkles class="text-primary mt-0.5 h-3 w-3 flex-shrink-0" />
														<div class="min-w-0 flex-1">
															<span class="text-foreground">Route:</span>
															<span class="opacity-80"
																>{thought.plan.route?.join(' → ') || '—'}</span
															>
															{#if thought.plan.sub_questions?.length}
																<ul class="mt-0.5 list-disc pl-4 text-[10px] opacity-70">
																	{#each thought.plan.sub_questions as q}
																		<li>{q}</li>
																	{/each}
																</ul>
															{/if}
														</div>
													{:else if thought.kind === 'reasoning'}
														<Brain class="mt-0.5 h-3 w-3 flex-shrink-0" />
														<div class="min-w-0 flex-1 break-words whitespace-pre-wrap opacity-80">
															{thought.delta}
														</div>
													{:else if thought.kind === 'tool_result'}
														<Check class="mt-0.5 h-3 w-3 flex-shrink-0" />
														<div class="min-w-0 flex-1 break-words whitespace-pre-wrap opacity-70">
															{thought.delta}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</details>
								{/if}
								<div
									role="presentation"
									onclick={handleLinkClick}
									class="prose prose-sm dark:prose-invert bg-muted text-foreground overflow-hidden rounded-2xl rounded-bl-sm px-4 py-2 text-sm"
								>
									{#if msg.content === '...'}
										<Loader2 class="text-muted-foreground h-4 w-4 animate-spin" />
									{:else}
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										{@html renderMarkdown(displayContent)}
									{/if}
								</div>
								{#if suggestions.length > 0 && msg.content !== '...'}
									<div class="mt-1.5 flex flex-col gap-1.5">
										{#each suggestions as sug, sugIdx (sugIdx)}
											{@const action = sug.action ?? 'create'}
											{@const key = chipKey(i, sugIdx)}
											{@const isExpanded = expandedChips.has(key)}
											{@const isAdded = chipAdded.has(key) || isSuggestionAlreadyInPlan(sug)}
											{@const chipClass =
												action === 'delete'
													? 'bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400'
													: action === 'update'
														? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400'
														: isAdded
															? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
															: 'bg-primary/10 hover:bg-primary/20 text-primary'}
											{@const Icon =
												action === 'delete'
													? Trash2
													: action === 'update'
														? Pencil
														: isAdded
															? Check
															: Plus}
											{@const label =
												action === 'delete'
													? sug.reason || t('ai.deleteItem')
													: action === 'update'
														? `${t('ai.update')}: ${sug.changes?.title ?? sug.reason ?? ''}`
														: sug.title}

											{#if action === 'create' && !isAdded && (sug.target ?? 'plan_item') === 'plan_item'}
												<!-- Expandable create chip: click to expand, adjust day/time, then add -->
												<button
													type="button"
													title={sug.reason ?? ''}
													class="{chipClass} inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors"
													onclick={() => toggleChip(key, sug)}
												>
													<Icon class="h-3 w-3 flex-shrink-0" />
													<span class="min-w-0 flex-1 truncate">{label}</span>
													{#if sug.address}
														<span class="text-muted-foreground flex-shrink-0 truncate text-[10px]"
															>📍 {sug.address.slice(0, 20)}{sug.address.length > 20
																? '…'
																: ''}</span
														>
													{/if}
												</button>
												{#if isExpanded}
													{@const edit = chipEdits[key]}
													<div class="bg-muted/50 border-border ml-4 rounded-lg border p-2.5">
														<div class="mb-2 flex items-center gap-2 text-[10px]">
															<span class="text-foreground truncate font-medium">{sug.title}</span>
															{#if chipGeocoding.has(key)}
																<Loader2 class="text-muted-foreground h-2.5 w-2.5 animate-spin" />
															{/if}
														</div>
														{#if edit}
															<div class="space-y-2">
																<div class="flex items-center gap-2">
																	<label
																		class="text-muted-foreground flex items-center gap-1 text-[10px]"
																	>
																		{t('common.day')}:
																		<select
																			bind:value={edit.day}
																			class="border-border bg-card rounded border px-1.5 py-0.5 text-[10px]"
																		>
																			{#each Array.from({ length: (pageContext.num_days as number) || 3 }, (_, idx) => idx + 1) as dayNum}
																				<option value={dayNum}>{t('common.day')} {dayNum}</option>
																			{/each}
																		</select>
																	</label>
																	<label
																		class="text-muted-foreground flex items-center gap-1 text-[10px]"
																	>
																		{t('ai.time')}:
																		<input
																			type="time"
																			bind:value={edit.time}
																			disabled={edit.noTime}
																			class="border-border bg-card rounded border px-1.5 py-0.5 text-[10px] disabled:opacity-40"
																		/>
																	</label>
																	<label
																		class="text-muted-foreground flex items-center gap-0.5 text-[10px]"
																	>
																		<input
																			type="checkbox"
																			bind:checked={edit.noTime}
																			class="h-2.5 w-2.5"
																		/>
																		{t('ai.noTime')}
																	</label>
																</div>
																<div class="flex items-center gap-2">
																	<label
																		class="text-muted-foreground flex items-center gap-1 text-[10px]"
																	>
																		{t('ai.type')}:
																		<select
																			bind:value={edit.type}
																			class="border-border bg-card rounded border px-1.5 py-0.5 text-[10px]"
																		>
																			{#each ['sightseeing', 'food', 'activity', 'transport', 'accommodation', 'rest', 'shopping'] as typ}
																				<option value={typ}>{typ}</option>
																			{/each}
																		</select>
																	</label>
																	<label
																		class="text-muted-foreground flex items-center gap-1 text-[10px]"
																	>
																		{t('ai.cost')}:
																		<input
																			type="number"
																			bind:value={edit.cost}
																			step="0.01"
																			placeholder="0"
																			class="border-border bg-card w-16 rounded border px-1.5 py-0.5 text-[10px]"
																		/>
																		<input
																			type="text"
																			bind:value={edit.currency}
																			placeholder="€"
																			class="border-border bg-card w-8 rounded border px-1 py-0.5 text-[10px]"
																		/>
																	</label>
																</div>
																<div>
																	<input
																		type="text"
																		bind:value={edit.address}
																		placeholder={t('ai.addressPlaceholder') || 'Address'}
																		class="border-border bg-card w-full rounded border px-1.5 py-0.5 text-[10px]"
																	/>
																</div>
																<div class="flex items-center justify-end gap-1.5 pt-1">
																	<button
																		type="button"
																		onclick={() => toggleChip(key, sug)}
																		class="text-muted-foreground hover:text-foreground rounded px-2 py-1 text-[10px]"
																	>
																		{t('common.actions.cancel')}
																	</button>
																	<button
																		type="button"
																		onclick={() => confirmAddChip(key, sug)}
																		class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1 rounded px-2.5 py-1 text-[10px] font-medium"
																	>
																		<Plus class="h-2.5 w-2.5" />
																		{t('ai.addToDay', { day: edit.day })}
																	</button>
																</div>
															</div>
														{/if}
													</div>
												{/if}
											{:else}
												<!-- Delete/Update/Added chips: one-click action (no expand) -->
												<button
													type="button"
													title={sug.reason ?? ''}
													class="{chipClass} inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors"
													onclick={() => !isAdded && onAcceptSuggestion(sug)}
													disabled={isAdded}
												>
													<Icon class="h-3 w-3 flex-shrink-0" />
													<span class="min-w-0 flex-1 truncate">{label}</span>
													{#if action === 'create' && isAdded}
														<span class="flex-shrink-0 text-[10px] text-emerald-600">✓</span>
													{/if}
												</button>
											{/if}
										{/each}
									</div>
								{/if}
								{#if looksLikeUnparsedProposal(msg.content, rawSuggestions)}
									<p class="text-muted-foreground mt-1.5 text-[11px] italic">
										{t('ai.parseFailed')}
									</p>
								{/if}
								{#if msg.content !== '...'}
									<div class="mt-1 flex items-center gap-2">
										<button
											type="button"
											class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] transition-colors"
											onclick={() => copyMessage(i)}
										>
											{#if copiedIdx === i}
												<Check class="h-3 w-3" /> {t('ai.copied')}
											{:else}
												<Copy class="h-3 w-3" /> {t('ai.copy')}
											{/if}
										</button>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				{/each}
			{/if}
		</div>

		<!-- Input -->
		<div class="border-border flex items-center gap-2 border-t p-3">
			<input
				type="text"
				bind:value={input}
				bind:this={inputEl}
				onkeydown={handleKeydown}
				placeholder={t('ai.placeholder')}
				class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
				disabled={inputDisabled}
			/>
			<button
				type="button"
				onclick={send}
				disabled={inputDisabled || !input.trim()}
				class="bg-primary hover:bg-primary/90 text-primary-foreground inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50"
			>
				{#if isSending}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Send class="h-4 w-4" />
				{/if}
			</button>
		</div>
	</aside>
{/if}

{#if shareOpen}
	<!-- Backdrop -->
	<button
		type="button"
		class="fixed inset-0 z-[60] bg-black/50"
		aria-label="Close share panel"
		onclick={() => (shareOpen = false)}
		transition:fade={{ duration: 150 }}
	></button>

	<!-- Share modal -->
	<div
		class="bg-card border-border fixed inset-y-0 right-0 z-[70] flex w-full max-w-2xl flex-col border-l shadow-2xl"
		transition:slide={{ duration: 250 }}
	>
		<header class="border-border flex items-center justify-between border-b p-3">
			<div class="flex items-center gap-2">
				<Share2 class="text-primary h-4 w-4" />
				<h2 class="text-foreground text-sm font-semibold">{t('ai.shareTitle')}</h2>
			</div>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="border-border text-foreground hover:bg-muted inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs"
					onclick={downloadShareText}
				>
					{t('ai.download') || 'Download'}
				</button>
				<button
					type="button"
					class="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs"
					onclick={copyShareText}
				>
					{#if shareCopied}
						<Check class="h-3 w-3" /> {t('ai.copied')}
					{:else}
						<Copy class="h-3 w-3" /> {t('ai.copyAll')}
					{/if}
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
					onclick={() => (shareOpen = false)}
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		</header>
		<div class="flex-1 overflow-auto p-3">
			<textarea
				readonly
				value={shareText}
				class="border-border bg-background text-foreground h-full w-full resize-none rounded-md border p-3 font-mono text-xs"
				onclick={(e) => (e.target as HTMLTextAreaElement).select()}></textarea>
		</div>
		<div class="border-border text-muted-foreground border-t p-2 text-center text-[10px]">
			{t('ai.shareHint')}
		</div>
	</div>
{/if}
