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
	import { ChatService, type ChatMessage, type AgentThought } from '$lib/services/chat.service';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { translate } from '$lib/i18n';
	import { aiDrawer, type AiPageContext, type PlanSuggestion } from '$lib/stores/ai-drawer';
	import { fade, slide } from 'svelte/transition';

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
	};

	let messages = $state<ChatTurn[]>([]);
	let input = $state('');
	let isSending = $state(false);
	let isConnecting = $state(false);
	let connectionError = $state<string | null>(null);
	let inputEl: HTMLInputElement | null = $state(null);
	let scrollContainer: HTMLElement | null = $state(null);
	// Track which messages have their reasoning panel expanded (keyed by message index).
	// ponytail: Svelte's scoped CSS doesn't see classes inside {#each} loops across
	// <details>, so we toggle a single chevron via state instead of CSS pseudo-selectors.
	let openThoughts = $state<Record<number, boolean>>({});
	let copiedIdx = $state<number | null>(null);

	let conversations = $state<Conversation[]>([]);
	let showConversationList = $state(false);
	let activeConversationId = $state<string | null>(null);

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
			: t('ai.dataAnalysis')
	);

	// In plan mode + accept handler registered → show suggestion chips
	let canAcceptSuggestions = $derived(
		pageContext.page === 'plan' && aiDrawer.getAcceptSuggestionHandler() !== null
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
				onDone: () => {
					isSending = false;
				},
				onError: (error: any) => {
					console.error('Chat error:', error);
					const lastIdx = messages.length - 1;
					if (messages[lastIdx]?.role === 'assistant') {
						messages[lastIdx].content = t('ai.error');
						messages = [...messages];
					}
					isSending = false;
				}
			});
			isConnecting = false;
			return true;
		} catch (err: any) {
			connectionError = err?.message ?? String(err);
			isConnecting = false;
			return false;
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
					.map((m: any) => ({
						role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
						content: String(m.content ?? m.text ?? '')
					}))
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
							? `Hi! I'm your trip planner for ${destination} (${numDays} days). Ask me for an itinerary, restaurants, or activities.`
							: `Hi! I'm your trip planner for ${destination}. Ask me for an itinerary or activities.`
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

	// Suggestion parsing for plan mode (ported from TripPlannerChat)
	type ParsedSuggestion = PlanSuggestion;

	function extractSuggestions(content: string): ParsedSuggestion[] {
		const jsonMatch = content.match(/```json\s*\n?(\[[\s\S]*?\])\s*\n?```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				if (Array.isArray(parsed)) return parsed;
			} catch {}
		}
		const rawJsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
		if (rawJsonMatch) {
			try {
				const parsed = JSON.parse(rawJsonMatch[0]);
				if (Array.isArray(parsed)) return parsed;
			} catch {}
		}
		return [];
	}

	function stripJsonBlocks(content: string): string {
		return content.replace(/```json\s*\n?(\[[\s\S]*?\])\s*\n?```/g, '').trim();
	}

	async function onAcceptSuggestion(sug: ParsedSuggestion) {
		const handler = aiDrawer.getAcceptSuggestionHandler();
		if (!handler) return;
		await handler(sug);
	}

	async function send() {
		if (!input.trim() || isSending) return;
		const ok = await ensureConnected();
		if (!ok) return;

		const userMsg = input.trim();
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
		const isFirstUserMessage = messages.filter((m) => m.role === 'user').length === 0;
		const inPlanMode = pageContext.page === 'plan';
		let msgToSend = userMsg;
		if (isFirstUserMessage && inPlanMode) {
			const ctxBlock = [
				`[TRIP CONTEXT]`,
				`trip_id=${pageContext.trip_id ?? ''}`,
				`trip_title=${pageContext.trip_title ?? ''}`,
				`start=${pageContext.trip_dates?.start ?? ''}`,
				`end=${pageContext.trip_dates?.end ?? ''}`,
				`num_days=${pageContext.num_days ?? ''}`,
				`primary_city=${pageContext.primary_city ?? ''}`,
				`home_city=${pageContext.home_city ?? ''}`
			].join('; ');
			msgToSend = `${ctxBlock}\n\n${userMsg}`;
		}

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

	// Suggestion chips for empty state
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
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
					title={t('ai.conversations')}
					onclick={() => (showConversationList = !showConversationList)}
				>
					<MessageSquare class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
					title={t('ai.share')}
					onclick={openSharePanel}
				>
					<Share2 class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
					title={t('ai.newConversation')}
					onclick={startNewConversation}
				>
					<Plus class="h-4 w-4" />
				</button>
				<button
					type="button"
					class="text-muted-foreground hover:bg-muted hover:text-foreground rounded p-1.5"
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

		<!-- Messages -->
		<div bind:this={scrollContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
			{#if messages.length === 0 && !isConnecting}
				<!-- Empty state with suggestions -->
				<div class="space-y-3">
					<p class="text-muted-foreground text-sm">{t('ai.emptyState')}</p>
					<div class="flex flex-wrap gap-2">
						{#each pageContext.page === 'plan' ? planSuggestions : dataSuggestions.map( (f) => f() ) as suggestion}
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
								class="bg-primary text-primary-foreground max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm px-4 py-2 text-sm"
							>
								{msg.content}
							</div>
						</div>
					{:else}
						{@const suggestions = canAcceptSuggestions ? extractSuggestions(msg.content) : []}
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
																	class="block break-all whitespace-pre-wrap text-[10px] opacity-70"
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
														<div class="min-w-0 flex-1 whitespace-pre-wrap break-words opacity-80">
															{thought.delta}
														</div>
													{:else if thought.kind === 'tool_result'}
														<Check class="mt-0.5 h-3 w-3 flex-shrink-0" />
														<div class="min-w-0 flex-1 whitespace-pre-wrap break-words opacity-70">
															{thought.delta}
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</details>
								{/if}
								<div
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
											{@const chipClass =
												action === 'delete'
													? 'bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400'
													: action === 'update'
														? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400'
														: 'bg-primary/10 hover:bg-primary/20 text-primary'}
											{@const Icon =
												action === 'delete' ? Trash2 : action === 'update' ? Pencil : Plus}
											{@const label =
												action === 'delete'
													? sug.reason || t('ai.deleteItem')
													: action === 'update'
														? `${t('ai.update')}: ${sug.changes?.title ?? sug.reason ?? ''}`
														: sug.title}
											<button
												type="button"
												title={sug.reason ?? ''}
												class="{chipClass} inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors"
												onclick={() => onAcceptSuggestion(sug)}
											>
												<Icon class="h-3 w-3 flex-shrink-0" />
												<span class="min-w-0 flex-1 truncate">{label}</span>
												{#if action === 'create'}
													<span class="text-muted-foreground flex-shrink-0"
														>→ {t('common.day')} {sug.day}</span
													>
												{/if}
											</button>
										{/each}
									</div>
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
				disabled={isSending || isConnecting}
			/>
			<button
				type="button"
				onclick={send}
				disabled={isSending || isConnecting || !input.trim()}
				class="bg-primary hover:bg-primary/90 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-primary-foreground transition-colors disabled:opacity-50"
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
