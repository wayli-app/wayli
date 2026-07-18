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
		ChevronDown,
		Brain,
		Wrench
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
	// Thoughts accumulated for the in-flight assistant turn; flushed into the
	// message's `thoughts` array on each event.
	let pendingThoughts = $state<AgentThought[]>([]);
	let input = $state('');
	let isSending = $state(false);
	let isConnecting = $state(false);
	let connectionError = $state<string | null>(null);
	let inputEl: HTMLInputElement | null = $state(null);
	let scrollContainer: HTMLElement | null = $state(null);
	let copiedIdx = $state<number | null>(null);

	let conversations = $state<Conversation[]>([]);
	let showConversationList = $state(false);
	let activeConversationId = $state<string | null>(null);

	let chatService: ChatService | null = null;
	let currentCtx: AiPageContext = { page: 'default' };

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
		// Track context changes
		const newCtx = pageContext;
		if (newCtx !== currentCtx) {
			currentCtx = newCtx;
		}
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
						// Flush any pending thoughts into this turn when content starts arriving.
						if (pendingThoughts.length > 0) {
							messages[lastIdx].thoughts = [
								...(messages[lastIdx].thoughts ?? []),
								...pendingThoughts
							];
							pendingThoughts = [];
						}
						messages = [...messages];
						scrollToBottom();
					}
				},
				onAgentThought: (thought) => {
					// Accumulate while the assistant turn streams. Flushed on first content
					// update above; if no content arrives (rare), flush on done.
					pendingThoughts = [...pendingThoughts, thought];
				},
				onDone: () => {
					// Final flush in case onContent never ran (e.g., error path).
					if (pendingThoughts.length > 0) {
						const lastIdx = messages.length - 1;
						if (messages[lastIdx]?.role === 'assistant') {
							messages[lastIdx].thoughts = [
								...(messages[lastIdx].thoughts ?? []),
								...pendingThoughts
							];
							messages = [...messages];
						}
						pendingThoughts = [];
					}
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
			pendingThoughts = [];
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
		const inPlanMode = currentCtx.page === 'plan';
		const tripTitle = currentCtx.trip_title;
		const numDays = currentCtx.num_days;
		const primaryCity = currentCtx.primary_city;
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
		pendingThoughts = [];

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
		const inPlanMode = currentCtx.page === 'plan';
		let msgToSend = userMsg;
		if (isFirstUserMessage && inPlanMode) {
			const ctxBlock = [
				`[TRIP CONTEXT]`,
				`trip_id=${currentCtx.trip_id ?? ''}`,
				`trip_title=${currentCtx.trip_title ?? ''}`,
				`start=${currentCtx.trip_dates?.start ?? ''}`,
				`end=${currentCtx.trip_dates?.end ?? ''}`,
				`num_days=${currentCtx.num_days ?? ''}`,
				`primary_city=${currentCtx.primary_city ?? ''}`
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
				currentCtx.page // 'default' | 'plan'
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
			city: currentCtx.primary_city || currentCtx.trip_title || 'this trip'
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
								     is the smallest collapse UI; default closed so the chat stays readable. -->
									<details class="border-border mb-1 rounded-md border text-[11px]" open={false}>
										<summary
											class="text-muted-foreground hover:bg-muted flex cursor-pointer list-none items-center gap-1 px-2 py-1 text-[10px]"
										>
											<Brain class="h-3 w-3" />
											{t('ai.reasoning', { count: msg.thoughts!.length })}
											<ChevronRight class="ml-auto h-3 w-3 details-closed-only" />
											<ChevronDown class="ml-auto h-3 w-3 details-open-only" />
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
									<div class="mt-1.5 flex flex-wrap gap-1.5">
										{#each suggestions as sug, sugIdx (sugIdx)}
											<button
												type="button"
												class="bg-primary/10 hover:bg-primary/20 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
												onclick={() => onAcceptSuggestion(sug)}
											>
												<Plus class="h-3 w-3" />
												{sug.title.slice(0, 25)}{sug.title.length > 25 ? '…' : ''}
												<span class="text-muted-foreground">→ {t('common.day')} {sug.day}</span>
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

<style>
	/* Toggle chevron visibility based on <details> open state.
	   ponytail: a CSS-only collapse indicator — no JS state needed. */
	details:not([open]) .details-open-only {
		display: none;
	}
	details[open] .details-closed-only {
		display: none;
	}
</style>
