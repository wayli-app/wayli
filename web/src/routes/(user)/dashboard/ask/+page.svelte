<script lang="ts">
	import { onMount, onDestroy, tick } from 'svelte';
	import {
		Search,
		Loader2,
		Sparkles,
		MapPin,
		Clock,
		AlertCircle,
		Send,
		Bot,
		User,
		Coffee,
		Utensils,
		StopCircle,
		Settings,
		ExternalLink,
		X,
		FileText,
		ChevronRight,
		ChevronDown,
		Database,
		Menu,
		MessageSquare,
		Mic
	} from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { format } from 'date-fns';
	import { renderMarkdown } from '$lib/utils/markdown';

	import { translate } from '$lib/i18n';
	import {
		chatService,
		type ChatMessage,
		type QueryResultData,
		type ExecutionLog,
		type AIUserConversationSummary,
		type DailyQuotaSnapshot
	} from '$lib/services/chat.service';
	import { sessionStore } from '$lib/stores/auth';
	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { ChatResultRenderer, ConversationSidebar, PlaceMapModal } from '$lib/components/chat';
	import { detectResultType } from '$lib/utils/chat-result-detection';

	let t = $derived($translate);

	// State
	let question = $state('');
	let isConnected = $state(false);
	let isLoading = $state(false);
	let isListening = $state(false);
	let recognition: any = null;

	const supportsVoiceInput =
		typeof window !== 'undefined' &&
		('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

	function toggleVoiceInput() {
		if (!supportsVoiceInput) return;
		if (isListening) {
			recognition?.stop();
			return;
		}
		const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
		recognition = new SR();
		recognition.continuous = false;
		recognition.interimResults = true;
		recognition.lang = 'en-US';
		recognition.onresult = (event: any) => {
			const transcript = Array.from(event.results)
				.map((r: any) => r[0].transcript)
				.join('');
			question = transcript;
		};
		recognition.onerror = () => {
			isListening = false;
		};
		recognition.onend = () => {
			isListening = false;
		};
		recognition.start();
		isListening = true;
	}
	let showMobileSidebar = $state(false);
	let messages = $state<ChatMessage[]>([]);
	let currentStreamingContent = $state('');
	let currentQueryResults = $state<QueryResultData[]>([]);
	let error = $state<string | null>(null);

	// Progress and execution logs state
	let currentProgress = $state<{ step: string; message: string } | null>(null);
	let currentExecutionLogs = $state<ExecutionLog[]>([]);
	let executionLogCounter = 0;

	// Execution logs modal state
	let showExecutionLogsModal = $state(false);
	let selectedMessageLogs = $state<ExecutionLog[]>([]);

	// Streaming details collapse state
	let streamingDetailsExpanded = $state(false);

	// Daily quota (requests/day). Seeded on load via getUsage, updated live from onDone extras.
	let dailyQuota = $state<DailyQuotaSnapshot | null>(null);

	// Track which completed messages have expanded query results (by message id)
	let expandedMessageQueries = $state<Set<string>>(new Set());

	// Track which messages have expanded text (collapsed by default when cards are shown)
	let expandedMessageText = $state<Set<string>>(new Set());

	function toggleMessageQueries(messageId: string) {
		const newSet = new Set(expandedMessageQueries);
		if (newSet.has(messageId)) {
			newSet.delete(messageId);
		} else {
			newSet.add(messageId);
		}
		expandedMessageQueries = newSet;
	}

	function toggleMessageText(messageId: string) {
		const newSet = new Set(expandedMessageText);
		if (newSet.has(messageId)) {
			newSet.delete(messageId);
		} else {
			newSet.add(messageId);
		}
		expandedMessageText = newSet;
	}

	/**
	 * Check if any query results will be shown as cards (trips or places with <=6 items)
	 */
	function hasCardResults(queryResults: QueryResultData[] | undefined): boolean {
		if (!queryResults || queryResults.length === 0) return false;
		return queryResults.some((qr) => {
			const data = qr.data ?? [];
			const detection = detectResultType(qr.query, data, qr.rowCount);
			return detection.suggestedView === 'cards' && data.length <= 6;
		});
	}

	// Configuration error state
	let configurationError = $state(false);
	let isAdmin = $state(false);
	let allowUserOverride = $state(false);
	let isCheckingConfig = $state(true);

	// Conversation history state
	let conversationList = $state<AIUserConversationSummary[]>([]);
	let currentConversationId = $state<string | null>(null);
	let isLoadingConversations = $state(false);
	let isLoadingConversation = $state(false);

	// Lazy loading state
	const CONVERSATIONS_PER_PAGE = 20;
	let hasMoreConversations = $state(false);
	let conversationOffset = $state(0);
	let isLoadingMoreConversations = $state(false);

	// Input element reference
	let inputElement: HTMLInputElement | undefined = $state();

	// Messages container reference for auto-scroll
	let messagesContainer: HTMLDivElement | undefined = $state();

	// Scroll to bottom of messages
	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	// Place map modal state
	let selectedPlace = $state<Record<string, unknown> | null>(null);

	function handlePlaceClick(place: Record<string, unknown>) {
		selectedPlace = place;
	}

	function closePlaceModal() {
		selectedPlace = null;
	}

	// Example suggestions
	const suggestions = [
		{
			question: 'What were the last four trips I made?',
			description: 'View your most recent trips'
		},
		{
			question: 'Which cities did I most recently visit?',
			description: 'See your recent city visits'
		},
		{
			question: 'Which countries have I visited?',
			description: 'List all countries in your travel history'
		},
		{
			question: 'How many trips did I take last year?',
			description: 'Count your trips for the last year'
		}
	];

	// Connect to chat on mount
	onMount(async () => {
		await checkConfigAndConnect();
		await loadConversationList();
		// Seed the quota display; live updates arrive via onDone extras.
		dailyQuota = await chatService.getDailyUsageForName('location-assistant');
	});

	// Quota display state derived from the requests counter (tokens ignored for the badge).
	const CHATBOT_NAME = 'location-assistant';
	const quotaDisplay = $derived.by(() => {
		const q = dailyQuota;
		if (!q || q.requests.limit === 0) return null; // no limits configured / unlimited
		const remaining = Math.max(0, q.requests.limit - q.requests.used);
		const pct = q.requests.limit > 0 ? q.requests.used / q.requests.limit : 0;
		if (pct < 0.8) return null; // only show when approaching the limit
		return {
			remaining,
			limit: q.requests.limit,
			exhausted: remaining === 0,
			warning: pct >= 0.9 && remaining > 0,
			resetsAt: q.resetsAt
		};
	});

	function formatResetTime(iso?: string): string {
		if (!iso) return '';
		try {
			return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	// Disconnect on destroy
	onDestroy(() => {
		chatService.disconnect();
	});

	// Check configuration and connect to chat service
	async function checkConfigAndConnect() {
		isCheckingConfig = true;

		try {
			const session = $sessionStore;
			if (session) {
				// Check user role
				isAdmin = session.user?.metadata?.role === 'admin';

				// Check if user override is allowed
				const serviceAdapter = new ServiceAdapter({ session });
				const result = await serviceAdapter.getAllSettings();
				if (result?.app?.ai) {
					allowUserOverride = result.app.ai.allow_user_provider_override ?? false;
				}
			}
		} catch (err) {
			console.warn('Failed to load AI settings:', err);
		}

		isCheckingConfig = false;

		// Now try to connect
		await connectToChat();
	}

	// Connect to chat service
	async function connectToChat() {
		try {
			await chatService.connect({
				onContent: (delta, fullContent) => {
					currentStreamingContent = fullContent;
					// Scroll to bottom as content streams in
					scrollToBottom();
				},
				onProgress: (step, message) => {
					// Skip duplicate "generating" messages to avoid flickering
					const lastLog = currentExecutionLogs[currentExecutionLogs.length - 1];
					if (step === 'generating' && lastLog?.step === 'generating') {
						return;
					}

					// Only update progress display if this isn't a "generating" fallback
					// when we already have a more meaningful message
					if (step !== 'generating' || !currentProgress) {
						currentProgress = { step, message };
					}

					// Add to execution logs
					currentExecutionLogs = [
						...currentExecutionLogs,
						{
							id: ++executionLogCounter,
							step,
							message,
							timestamp: new Date()
						}
					];
				},
				onQueryResult: (result) => {
					// Accumulate query results (for tools that stream results via WebSocket)
					currentQueryResults = [...currentQueryResults, result];

					// Add the actual SQL query to execution logs for debugging
					currentExecutionLogs = [
						...currentExecutionLogs,
						{
							id: ++executionLogCounter,
							step: 'sql',
							message: result.query,
							timestamp: new Date()
						}
					];
				},
				onDone: async (usage, extras) => {
					// Extract images from markdown content and inject into query results
					const imageMap = extractMarkdownImages(currentStreamingContent);
					const enrichedQueryResults = injectImagesIntoResults(currentQueryResults, imageMap);

					// Live quota + telemetry (Fluxbase 2026.6.3). No analytics SDK yet — stub to console.
					if (extras?.dailyQuota) dailyQuota = extras.dailyQuota;
					if (extras?.matchedIntentRules?.length) {
						console.debug('[chat] intent rules fired:', extras.matchedIntentRules);
					}
					if (usage?.cachedTokens !== undefined && usage.cachedTokens > 0) {
						console.debug(
							'[chat] prompt cache hit:',
							`${usage.cachedTokens}/${usage.promptTokens} prompt tokens cached`
						);
					}

					// Always add a message - use fallback text if no content and no results
					const hasContent = currentStreamingContent || enrichedQueryResults.length > 0;
					const assistantMessage: ChatMessage = {
						id: chatService.generateMessageId(),
						role: 'assistant',
						content: currentStreamingContent || (hasContent ? '' : t('ask.noResponse')),
						timestamp: new Date(),
						queryResults: enrichedQueryResults.length > 0 ? [...enrichedQueryResults] : undefined,
						executionLogs: currentExecutionLogs.length > 0 ? [...currentExecutionLogs] : undefined,
						usage
					};
					messages = [...messages, assistantMessage];

					// Force Svelte to process the reactive update before scrolling
					await tick();
					scrollToBottom();
					// Reset all state
					currentStreamingContent = '';
					currentQueryResults = [];
					currentExecutionLogs = [];
					currentProgress = null;
					isLoading = false;

					// Refresh conversation list to show updated title/preview
					refreshConversationList();
				},
				onError: (errorMsg, code) => {
					error = errorMsg;
					isLoading = false;
					toast.error(errorMsg);
				}
			});

			// Mark as connected - conversation will be created on first message
			isConnected = true;
			configurationError = false;
		} catch (err) {
			console.error('Failed to connect to chat:', err);
			const errorMessage = (err as Error).message;

			// Check if this is a configuration error
			if (
				errorMessage.includes('Chatbot not found') ||
				errorMessage.includes('disabled') ||
				errorMessage.includes('not configured')
			) {
				configurationError = true;
				error = null; // Don't show as runtime error
			} else {
				error = errorMessage;
			}
		}
	}

	// Send a message
	async function sendMessage() {
		if (!question.trim() || isLoading || !isConnected) return;

		const userQuestion = question.trim();
		const isFirstMessage = messages.length === 0;
		question = '';
		error = null;
		isLoading = true;
		currentStreamingContent = '';
		currentQueryResults = [];
		currentExecutionLogs = [];
		currentProgress = null;
		executionLogCounter = 0;
		streamingDetailsExpanded = false;

		// Create conversation on first message
		if (!currentConversationId) {
			try {
				currentConversationId = await chatService.startChat('location-assistant', 'wayli');
			} catch (err) {
				error = (err as Error).message;
				isLoading = false;
				toast.error('Failed to start conversation');
				return;
			}
		}

		// Add user message
		const userMessage: ChatMessage = {
			id: chatService.generateMessageId(),
			role: 'user',
			content: userQuestion,
			timestamp: new Date()
		};
		messages = [...messages, userMessage];

		// Scroll to bottom after adding user message
		setTimeout(scrollToBottom, 0);

		// Optimistically add conversation to sidebar on first message
		if (isFirstMessage && currentConversationId) {
			const optimisticConversation: AIUserConversationSummary = {
				id: currentConversationId,
				chatbot: 'location-assistant',
				namespace: 'wayli',
				title: userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion,
				preview: userQuestion,
				message_count: 1,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString()
			};
			conversationList = [optimisticConversation, ...conversationList];
		}

		try {
			await chatService.sendMessage(userQuestion);
		} catch (err) {
			error = (err as Error).message;
			isLoading = false;
			toast.error('Failed to send message');
		}
	}

	// Cancel current message
	function cancelMessage() {
		chatService.cancel();
		isLoading = false;
	}

	// Use a suggestion
	function useSuggestion(suggestion: { question: string }) {
		question = suggestion.question;
		sendMessage();
	}

	// Format date for display
	function formatDate(dateStr: string): string {
		try {
			return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
		} catch {
			return dateStr;
		}
	}

	// Get step color for execution logs
	function getStepColor(step: string): string {
		switch (step) {
			case 'thinking':
				return 'text-purple-500';
			case 'generating':
				return 'text-blue-500';
			case 'querying':
				return 'text-green-500';
			case 'sql':
				return 'text-orange-500';
			default:
				return 'text-muted-foreground';
		}
	}

	// Get friendly table name from SQL query
	function getQueriedTable(query: string): string {
		if (/from\s+my_trips/i.test(query)) return 'trips';
		if (/from\s+my_place_visits/i.test(query)) return 'places';
		if (/from\s+my_tracker_data/i.test(query)) return 'GPS data';
		return 'data';
	}

	// Extract markdown images from content, returns map of lowercase alt text -> url
	function extractMarkdownImages(content: string): Map<string, string> {
		const imageMap = new Map<string, string>();
		// Match patterns like "Image: ![alt](url)" or just "![alt](url)"
		const regex = /(?:Image:\s*)?!\[([^\]]*)\]\(([^)]+)\)/gi;
		let match;
		while ((match = regex.exec(content)) !== null) {
			const [, alt, url] = match;
			if (alt && url) {
				imageMap.set(alt.toLowerCase().trim(), url);
			}
		}
		return imageMap;
	}

	// Inject extracted images into query results (trips that don't have image_url)
	function injectImagesIntoResults(
		queryResults: QueryResultData[],
		imageMap: Map<string, string>
	): QueryResultData[] {
		if (imageMap.size === 0) return queryResults;

		return queryResults.map((qr) => ({
			...qr,
			data: qr.data.map((row) => {
				// Only inject if this looks like a trip (has title) and doesn't have image_url
				const title = row.title as string | undefined;
				if (title && !row.image_url) {
					// Try to match by title (case-insensitive)
					const imageUrl = imageMap.get(title.toLowerCase().trim());
					if (imageUrl) {
						return { ...row, image_url: imageUrl };
					}
				}
				return row;
			})
		}));
	}

	// Open execution logs modal
	function openExecutionLogs(logs: ExecutionLog[] | undefined) {
		if (logs && logs.length > 0) {
			selectedMessageLogs = logs;
			showExecutionLogsModal = true;
		}
	}

	// Show current logs (during streaming)
	function showCurrentLogs() {
		selectedMessageLogs = currentExecutionLogs;
		showExecutionLogsModal = true;
	}

	// Close execution logs modal
	function closeExecutionLogsModal() {
		showExecutionLogsModal = false;
		selectedMessageLogs = [];
	}

	// Handle escape key for modal
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && showExecutionLogsModal) {
			closeExecutionLogsModal();
		}
	}

	// Load conversation list (initial load)
	async function loadConversationList() {
		isLoadingConversations = true;
		try {
			const result = await chatService.listConversations({
				chatbot: 'location-assistant',
				namespace: 'wayli',
				limit: CONVERSATIONS_PER_PAGE,
				offset: 0
			});
			conversationList = result.conversations;
			hasMoreConversations = result.has_more;
			conversationOffset = result.conversations.length;
		} catch (err) {
			console.error('Failed to load conversations:', err);
		} finally {
			isLoadingConversations = false;
		}
	}

	// Load more conversations (infinite scroll)
	async function loadMoreConversations() {
		if (!hasMoreConversations || isLoadingMoreConversations) return;

		isLoadingMoreConversations = true;
		try {
			const result = await chatService.listConversations({
				chatbot: 'location-assistant',
				namespace: 'wayli',
				limit: CONVERSATIONS_PER_PAGE,
				offset: conversationOffset
			});
			conversationList = [...conversationList, ...result.conversations];
			hasMoreConversations = result.has_more;
			conversationOffset += result.conversations.length;
		} catch (err) {
			console.error('Failed to load more conversations:', err);
		} finally {
			isLoadingMoreConversations = false;
		}
	}

	// Load a specific conversation
	async function loadConversation(conversationId: string) {
		if (conversationId === currentConversationId) return;

		isLoadingConversation = true;
		try {
			const conversation = await chatService.getConversation(conversationId);

			// Convert SDK messages to ChatMessage format
			messages = conversation.messages.map((msg) => ({
				id: msg.id,
				role: msg.role as 'user' | 'assistant',
				content: msg.content,
				timestamp: new Date(msg.timestamp),
				queryResults: msg.query_results?.map((qr) => ({
					query: qr.query,
					summary: qr.summary,
					rowCount: qr.row_count,
					data: qr.data
				})),
				usage: msg.usage
					? {
							promptTokens: msg.usage.prompt_tokens,
							completionTokens: msg.usage.completion_tokens,
							totalTokens: msg.usage.total_tokens
						}
					: undefined
			}));

			currentConversationId = conversationId;

			// Resume the conversation via WebSocket
			await chatService.startChat('location-assistant', 'wayli', conversationId);

			// Scroll to bottom after loading conversation
			setTimeout(scrollToBottom, 0);
		} catch (err) {
			console.error('Failed to load conversation:', err);
			toast.error('Failed to load conversation');
		} finally {
			isLoadingConversation = false;
		}
	}

	// Start a new conversation
	function startNewConversation() {
		messages = [];
		currentConversationId = null;
		currentStreamingContent = '';
		currentQueryResults = [];
		currentExecutionLogs = [];
		currentProgress = null;
		error = null;
		// Conversation will be created when user sends first message

		// Focus on input field
		inputElement?.focus();
	}

	// Delete a conversation
	async function deleteConversation(conversationId: string) {
		try {
			await chatService.deleteConversation(conversationId);
			conversationList = conversationList.filter((c) => c.id !== conversationId);

			// If deleted the current conversation, start new
			if (conversationId === currentConversationId) {
				await startNewConversation();
			}

			toast.success('Conversation deleted');
		} catch (err) {
			console.error('Failed to delete conversation:', err);
			toast.error('Failed to delete conversation');
		}
	}

	// Refresh conversation list after sending a message
	async function refreshConversationList() {
		// Small delay to allow backend to update
		setTimeout(async () => {
			await loadConversationList();
		}, 500);
	}

	// Mobile sidebar wrappers — close the drawer after an action
	function selectConversationMobile(id: string) {
		loadConversation(id);
		showMobileSidebar = false;
	}
	function startNewConversationMobile() {
		startNewConversation();
		showMobileSidebar = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Ask About Your Travels | Wayli</title>
</svelte:head>

<div class="-m-6 flex h-screen">
	<!-- Conversation Sidebar (desktop) -->
	<div class="hidden md:block">
		<ConversationSidebar
			conversations={conversationList}
			activeConversationId={currentConversationId}
			isLoading={isLoadingConversations}
			hasMore={hasMoreConversations}
			isLoadingMore={isLoadingMoreConversations}
			onSelect={loadConversation}
			onNewConversation={startNewConversation}
			onDelete={deleteConversation}
			onLoadMore={loadMoreConversations}
		/>
	</div>

	<!-- Conversation Sidebar (mobile drawer) -->
	{#if showMobileSidebar}
		<div class="fixed inset-0 z-40 md:hidden">
			<!-- Backdrop -->
			<button
				type="button"
				aria-label="Close conversations"
				class="absolute inset-0 bg-black/50"
				onclick={() => (showMobileSidebar = false)}
			></button>
			<!-- Drawer -->
			<div class="absolute top-0 left-0 h-full w-80 max-w-[85vw] shadow-xl">
				<ConversationSidebar
					conversations={conversationList}
					activeConversationId={currentConversationId}
					isLoading={isLoadingConversations}
					hasMore={hasMoreConversations}
					isLoadingMore={isLoadingMoreConversations}
					onSelect={selectConversationMobile}
					onNewConversation={startNewConversationMobile}
					onDelete={deleteConversation}
					onLoadMore={loadMoreConversations}
				/>
			</div>
		</div>
	{/if}

	<!-- Chat Area -->
	<div class="flex flex-1 flex-col overflow-hidden bg-background">
		<!-- Mobile Top Bar -->
		<div class="flex items-center gap-3 border-b p-3 md:hidden bg-card border-border">
			<button
				type="button"
				onclick={() => (showMobileSidebar = true)}
				aria-label="Open conversation history"
				class="rounded-lg p-2 text-gray-600 transition-colors dark:text-muted-foreground hover:bg-muted"
			>
				<Menu class="h-5 w-5" />
			</button>
			<span class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
				<MessageSquare class="h-4 w-4" />
				{currentConversationId
					? conversationList.find((c) => c.id === currentConversationId)?.title || t('ask.title')
					: t('ask.title')}
			</span>
		</div>

		<!-- Messages Area -->
		<div bind:this={messagesContainer} class="flex-1 overflow-y-auto">
			{#if isCheckingConfig}
				<!-- Loading configuration -->
				<div class="flex h-full flex-col items-center justify-center p-6">
					<Loader2 class="mb-4 h-12 w-12 animate-spin text-muted-foreground" />
					<p class="text-sm text-muted-foreground">
						{t('ask.connectingToChat')}
					</p>
				</div>
			{:else if configurationError}
				<!-- Configuration Error State -->
				<div class="flex h-full flex-col items-center justify-center p-6">
					<div class="max-w-md text-center">
						<div
							class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30"
						>
							<AlertCircle class="h-8 w-8 text-orange-600 dark:text-orange-400" />
						</div>
						<h3 class="mb-2 text-xl font-semibold text-foreground">
							{t('ask.notConfigured')}
						</h3>
						<p class="mb-4 text-sm text-muted-foreground">
							{t('ask.notConfiguredDescription')}
						</p>
						<ul class="mb-6 text-left text-sm text-muted-foreground">
							<li class="flex items-start gap-2 py-1">
								<span class="text-muted-foreground">•</span>
								<span>{t('ask.notConfiguredReasons.disabled')}</span>
							</li>
							<li class="flex items-start gap-2 py-1">
								<span class="text-muted-foreground">•</span>
								<span>{t('ask.notConfiguredReasons.notSynced')}</span>
							</li>
							<li class="flex items-start gap-2 py-1">
								<span class="text-muted-foreground">•</span>
								<span>{t('ask.notConfiguredReasons.configError')}</span>
							</li>
						</ul>

						{#if isAdmin}
							<!-- Admin can configure settings -->
							<a
								href="/dashboard/server-admin-settings"
								class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
							>
								<Settings class="h-4 w-4" />
								{t('ask.configureAsAdmin')}
							</a>
						{:else if allowUserOverride}
							<!-- User can configure their own provider -->
							<a
								href="/dashboard/account-settings"
								class="bg-primary hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors"
							>
								<Settings class="h-4 w-4" />
								{t('ask.configureAsUser')}
							</a>
						{:else}
							<!-- User cannot configure, contact admin -->
							<p class="text-sm text-muted-foreground">
								{t('ask.contactAdmin')}
							</p>
						{/if}
					</div>
				</div>
			{:else if messages.length === 0 && !isLoading}
				<!-- Empty State with Suggestions -->
				<div class="flex h-full flex-col items-center justify-center p-6">
					<Bot class="mb-4 h-12 w-12 text-muted-foreground" />
					<h3 class="mb-2 text-lg font-medium text-muted-foreground">
						{t('ask.startConversation')}
					</h3>
					<p class="mb-6 text-center text-sm text-muted-foreground">
						{t('ask.askAnything')}
					</p>
					<div class="grid w-full max-w-2xl gap-2 sm:grid-cols-2">
						{#each suggestions.slice(0, 4) as suggestion (suggestion.question)}
							<button
								onclick={() => useSuggestion(suggestion)}
								class="hover:border-primary/50 dark:hover:border-primary group flex items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all hover:shadow-sm bg-card border-border"
							>
								<Sparkles
									class="text-primary mt-0.5 h-4 w-4 flex-shrink-0 opacity-60 group-hover:opacity-100"
								/>
								<div>
									<div class="font-medium text-foreground">
										{suggestion.question}
									</div>
									<div class="text-muted-foreground mt-0.5 text-xs">
										{suggestion.description}
									</div>
								</div>
							</button>
						{/each}
					</div>
				</div>
			{:else}
				<!-- Messages -->
				<div class="space-y-4 p-4">
					{#each messages as message (message.id)}
						<div class="flex gap-3 {message.role === 'user' ? 'justify-end' : ''}">
							{#if message.role === 'assistant'}
								<div
									class="bg-primary/10 dark:bg-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
								>
									<Bot class="text-primary dark:text-primary h-5 w-5" />
								</div>
							{/if}
							<div
								class="max-w-[80%] rounded-xl px-4 py-3 {message.role === 'user'
									? 'bg-primary text-white'
									: 'bg-card'}"
							>
								{#if message.role === 'assistant'}
									{@const hasQueryResults = message.queryResults && message.queryResults.length > 0}
									<!-- Always show text response first (with Markdown rendering, strip images if cards shown) -->
									{#if message.content}
										<div
											class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-muted-foreground"
										>
											{@html renderMarkdown(message.content, hasQueryResults)}
										</div>
									{/if}

									<!-- Query Results (shown inline as cards below text) -->
									{#if message.queryResults && message.queryResults.length > 0}
										<div class="mt-4 space-y-3">
											{#each message.queryResults as queryResult, idx}
												<ChatResultRenderer
													{queryResult}
													queryIndex={idx}
													totalQueries={message.queryResults.length}
													onPlaceClick={handlePlaceClick}
												/>
											{/each}
										</div>
									{/if}

									<!-- View Execution Logs button -->
									{#if message.executionLogs && message.executionLogs.length > 0}
										<button
											onclick={() => openExecutionLogs(message.executionLogs)}
											class="text-primary hover:text-primary/80 dark:text-primary dark:hover:text-primary/80 mt-2 flex items-center gap-1 text-xs hover:underline"
										>
											<FileText class="h-3 w-3" />
											{t('ask.viewExecutionLogs', { count: message.executionLogs.length })}
										</button>
									{/if}
								{:else}
									<div>{message.content}</div>
								{/if}
							</div>
							{#if message.role === 'user'}
								<div
									class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 dark:bg-muted"
								>
									<User class="h-5 w-5 text-muted-foreground" />
								</div>
							{/if}
						</div>
					{/each}

					<!-- Streaming Response -->
					{#if isLoading}
						<div class="flex gap-3">
							<div
								class="bg-primary/10 dark:bg-primary/20 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
							>
								<Bot class="text-primary dark:text-primary h-5 w-5" />
							</div>
							<div class="max-w-[80%] rounded-xl px-4 py-3 bg-card">
								<!-- Collapsible Query Summary -->
								{#if currentQueryResults.length > 0}
									<button
										type="button"
										onclick={() => (streamingDetailsExpanded = !streamingDetailsExpanded)}
										class="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-muted-foreground"
									>
										{#if streamingDetailsExpanded}
											<ChevronDown class="h-3.5 w-3.5 flex-shrink-0" />
										{:else}
											<ChevronRight class="h-3.5 w-3.5 flex-shrink-0" />
										{/if}
										<Database class="h-3 w-3 flex-shrink-0" />
										<span
											>{currentQueryResults.length}
											{currentQueryResults.length === 1
												? t('ask.queryExecuted')
												: t('ask.queriesExecutedPlural')}</span
										>
									</button>

									<!-- Expanded Query Details -->
									{#if streamingDetailsExpanded}
										<div class="mt-2 rounded-lg border p-2 bg-background border-border">
											{#each currentQueryResults as queryResult, idx}
												<div
													class="flex items-center justify-between py-1 text-xs {idx > 0
														? 'border-t border-border'
														: ''}"
												>
													<span class="text-muted-foreground">
														{getQueriedTable(queryResult.query)}
													</span>
													<span class="text-muted-foreground">
														{queryResult.rowCount} rows
													</span>
												</div>
											{/each}
										</div>
									{/if}
								{/if}

								<!-- Streaming content (with live Markdown rendering) -->
								{#if currentStreamingContent}
									<div
										class="prose prose-sm dark:prose-invert max-w-none text-gray-800 dark:text-muted-foreground"
									>
										{@html renderMarkdown(currentStreamingContent, currentQueryResults.length > 0)}
									</div>
									<span class="mt-1 inline-block h-4 w-2 animate-pulse bg-gray-400"></span>
								{:else if !currentQueryResults.length}
									<!-- Status Indicator - only show when no content or query results have arrived yet -->
									<div
										class="flex items-center gap-2 text-sm text-muted-foreground"
										style="min-height: 24px;"
										role="status"
										aria-live="polite"
									>
										<Loader2
											class="text-primary dark:text-primary h-4 w-4 flex-shrink-0 animate-spin"
										/>
										<span class="transition-opacity duration-150">
											{currentProgress?.message || t('ask.thinking')}
										</span>
									</div>
								{/if}
							</div>
						</div>
					{/if}

					<!-- Error -->
					{#if error}
						<div
							class="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400"
						>
							<AlertCircle class="h-4 w-4 flex-shrink-0" />
							{error}
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Input Area -->
		<div class="flex-shrink-0 border-t p-4 bg-card border-border">
			<div class="relative flex items-center gap-2">
				<input
					type="text"
					bind:this={inputElement}
					bind:value={question}
					onkeydown={(e) => e.key === 'Enter' && sendMessage()}
					placeholder={isConnected ? t('ask.inputPlaceholder') : t('ask.inputConnecting')}
					disabled={isLoading || !isConnected}
					class="focus:border-primary focus:ring-primary/20 dark:focus:border-primary flex-1 rounded-xl border border-gray-300 py-3 pr-24 pl-4 shadow-sm transition-all focus:ring-2 focus:outline-none disabled:opacity-50 dark:border-border dark:text-white bg-card"
				/>
				{#if supportsVoiceInput && !isLoading}
					<button
						type="button"
						onclick={toggleVoiceInput}
						aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
						class="absolute right-12 rounded-lg p-2 transition-colors {isListening
							? 'bg-red-500 text-white animate-pulse'
							: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					>
						<Mic class="h-5 w-5" />
					</button>
				{/if}
				{#if isLoading}
					<button
						onclick={cancelMessage}
						class="absolute right-3 rounded-lg bg-red-500 p-2 text-white transition-colors hover:bg-red-600"
						title="Cancel"
						aria-label="Cancel message"
					>
						<StopCircle class="h-5 w-5" />
					</button>
				{:else}
					<button
						onclick={sendMessage}
						disabled={!question.trim() || !isConnected}
						aria-label="Send message"
						class="bg-primary hover:bg-primary/90 absolute right-3 rounded-lg p-2 text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Send class="h-5 w-5" />
					</button>
				{/if}
			</div>

			<!-- Daily quota hint (Fluxbase 2026.6.3). Hidden when no limits configured. -->
			{#if quotaDisplay}
				<div class="mt-2 flex items-center justify-center gap-1.5 text-xs">
					{#if quotaDisplay.exhausted}
						<span class="font-medium text-red-600 dark:text-red-400">
							Daily limit reached{#if quotaDisplay.resetsAt}
								· resets at {formatResetTime(quotaDisplay.resetsAt)}{/if}
						</span>
					{:else}
						<span
							class={quotaDisplay.warning
								? 'font-medium text-amber-600 dark:text-amber-400'
								: 'text-muted-foreground'}
						>
							{quotaDisplay.remaining}/{quotaDisplay.limit} messages left today{#if quotaDisplay.resetsAt}
								· resets at {formatResetTime(quotaDisplay.resetsAt)}{/if}
						</span>
					{/if}
				</div>
			{/if}

			<!-- Connection Status -->
			{#if !isConnected && !configurationError && !isCheckingConfig}
				<div class="mt-2 flex items-center justify-center gap-2 text-sm text-muted-foreground">
					<Loader2 class="h-4 w-4 animate-spin" />
					{t('ask.connectingToChat')}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Execution Logs Modal -->
{#if showExecutionLogsModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="execution-logs-title"
		onclick={closeExecutionLogsModal}
		onkeydown={(e) => e.key === 'Escape' && closeExecutionLogsModal()}
		tabindex="0"
	>
		<div
			class="w-full max-w-lg rounded-xl p-6 shadow-xl bg-card"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			tabindex="-1"
		>
			<!-- Header -->
			<div class="mb-4 flex items-center justify-between">
				<h3 id="execution-logs-title" class="text-lg font-semibold text-foreground">
					{t('ask.executionLogs')}
				</h3>
				<button
					onclick={closeExecutionLogsModal}
					class="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-muted-foreground"
					aria-label="Close modal"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Logs Container -->
			<div
				class="max-h-64 overflow-y-auto rounded-lg border bg-gray-50 p-3 font-mono text-xs dark:bg-background border-border"
			>
				{#if selectedMessageLogs.length === 0}
					<div class="flex h-full items-center justify-center text-muted-foreground">
						{t('ask.noLogsAvailable')}
					</div>
				{:else}
					{#each selectedMessageLogs as log (log.id)}
						<div class="mb-1 flex gap-2">
							<span class="flex-shrink-0 uppercase {getStepColor(log.step)}">
								[{log.step}]
							</span>
							<span class="text-muted-foreground">{log.message}</span>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Footer -->
			<div class="mt-4 flex justify-end">
				<button
					onclick={closeExecutionLogsModal}
					class="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted bg-muted"
				>
					{t('ask.close')}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Place Map Modal -->
<PlaceMapModal place={selectedPlace} onClose={closePlaceModal} />
