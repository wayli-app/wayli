<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Send, Loader2, Plus, Copy, Check } from 'lucide-svelte';
	import { ChatService } from '$lib/services/chat.service';
	import { renderMarkdown } from '$lib/utils/markdown';
	import { translate, currentLocale } from '$lib/i18n';
	import { get } from 'svelte/store';
	import type { PlanItem } from '$lib/services/trip-plan.service';

	let t = $derived($translate);

	type Props = {
		tripId: string;
		tripTitle: string;
		startDate: string;
		endDate: string;
		primaryCity?: string;
		numDays: number;
		planItems?: PlanItem[];
		onAcceptItem?: (item: {
			title: string;
			type: string;
			day: number;
			cost?: number;
			currency?: string;
			time?: string;
		}) => void;
	};

	let {
		tripId,
		tripTitle,
		startDate,
		endDate,
		primaryCity = '',
		numDays,
		planItems = [],
		onAcceptItem
	}: Props = $props();

	type ParsedSuggestion = {
		day: number;
		title: string;
		type: string;
		cost?: number;
		currency?: string;
		time?: string;
	};

	function extractSuggestions(content: string): ParsedSuggestion[] {
		// Try JSON block first: ```json\n[...]\n```
		const jsonMatch = content.match(/```json\s*\n?(\[[\s\S]*?\])\s*\n?```/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[1]);
				if (Array.isArray(parsed)) return parsed;
			} catch {}
		}
		// Try raw JSON array
		const rawJsonMatch = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
		if (rawJsonMatch) {
			try {
				const parsed = JSON.parse(rawJsonMatch[0]);
				if (Array.isArray(parsed)) return parsed;
			} catch {}
		}
		// Fallback: regex parsing
		return parseSuggestionsRegex(content);
	}

	function parseSuggestionsRegex(content: string): ParsedSuggestion[] {
		const suggestions: ParsedSuggestion[] = [];
		const lines = content.split('\n');
		let currentDay = 0;

		for (const line of lines) {
			const dayMatch = line.match(/Day\s+(\d+)/i);
			if (dayMatch && !line.match(/^[-•*]/)) {
				currentDay = parseInt(dayMatch[1]);
				continue;
			}
			const itemMatch = line.match(
				/^[-•*]\s*(?:([📷🍴🎯🚇🏨☕🛍️])\s*)?(?:(Morning|Afternoon|Evening|Lunch|Dinner|Night)\s*[:–-]\s*)?(.+?)(?:\s*\(([^)]+)\))?\s*$/
			);
			if (itemMatch && currentDay > 0) {
				const icon = itemMatch[1];
				const timeOfDay = itemMatch[2];
				let title = itemMatch[3]?.trim() || '';
				const details = itemMatch[4] || '';
				if (!title || title.length < 2) continue;
				title = title.replace(/\s*\([^)]*\)\s*$/g, '').trim();

				const typeMap: Record<string, string> = {
					'📷': 'sightseeing',
					'🍴': 'food',
					'🎯': 'activity',
					'🚇': 'transport',
					'🏨': 'accommodation',
					'☕': 'rest',
					'🛍️': 'shopping'
				};
				const detailsLower = details.toLowerCase();
				let detectedType = typeMap[icon || ''] || 'activity';
				if (!typeMap[icon || '']) {
					for (const [type, kws] of Object.entries({
						sightseeing: ['museum', 'monument', 'landmark', 'temple', 'cathedral'],
						food: ['restaurant', 'lunch', 'dinner', 'breakfast', 'café', 'cafe', 'bar'],
						activity: ['activity', 'tour', 'park', 'garden', 'beach'],
						transport: ['transport', 'train', 'bus', 'metro', 'taxi'],
						accommodation: ['hotel', 'hostel', 'airbnb', 'stay'],
						rest: ['rest', 'coffee', 'break'],
						shopping: ['market', 'shop']
					})) {
						if (kws.some((kw) => detailsLower.includes(kw))) {
							detectedType = type;
							break;
						}
					}
				}
				const costMatch = details.match(/[€$¥£](\d+(?:\.\d+)?)/);
				const currencyMatch = details.match(/[€$¥£]/);
				const timeMap: Record<string, string> = {
					Morning: '09:00',
					Lunch: '12:00',
					Afternoon: '14:00',
					Dinner: '19:00',
					Evening: '20:00',
					Night: '22:00'
				};
				suggestions.push({
					day: currentDay,
					title,
					type: detectedType,
					cost: costMatch ? parseFloat(costMatch[1]) : undefined,
					currency: currencyMatch ? currencyMatch[0] : undefined,
					time: timeOfDay ? timeMap[timeOfDay] : undefined
				});
			}
		}
		return suggestions;
	}

	// Strip JSON blocks from content for display
	function stripJsonBlocks(content: string): string {
		return content.replace(/```json\s*\n?(\[[\s\S]*?\])\s*\n?```/g, '').trim();
	}

	let messages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
	let input = $state('');
	let isSending = $state(false);
	let scrollContainer: HTMLElement | null = $state(null);
	let chatService: ChatService | null = null;
	let copiedIdx = $state<number | null>(null);

	const planSummary = $derived.by(() => {
		if (planItems.length === 0) return '';
		const byDay = new Map<number, PlanItem[]>();
		for (const item of planItems) {
			const d = item.day_number || 1;
			if (!byDay.has(d)) byDay.set(d, []);
			byDay.get(d)!.push(item);
		}
		return [...byDay.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(
				([day, items]) =>
					`Day ${day}: ` +
					items
						.map(
							(i) =>
								`${i.start_time || ''} ${i.title} [${i.type}]${i.cost_estimate ? ` (${i.currency}${i.cost_estimate})` : ''}`
						)
						.join(', ')
			)
			.join('\n');
	});

	const SYSTEM_CONTEXT = `Trip: ${tripTitle} (${startDate} to ${endDate}), ${numDays} days${primaryCity ? `, destination: ${primaryCity}` : ''}. Trip ID: ${tripId}.${planSummary ? `\n\nExisting plan:\n${planSummary}` : '\n\nNo items planned yet.'}

Do not echo back the existing plan or labels. Only show new suggestions.`;

	onMount(async () => {
		// Try to load existing conversation
		chatService = new ChatService();
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
				onDone: () => {
					isSending = false;
				},
				onError: (error: any) => {
					console.error('Chat error:', error);
					const lastIdx = messages.length - 1;
					if (messages[lastIdx]?.role === 'assistant') {
						messages[lastIdx].content = t('plannerChat.error');
						messages = [...messages];
					}
					isSending = false;
				}
			});

			// List conversations for trip-planner
			const result = await chatService.listConversations({
				chatbot: 'trip-planner',
				namespace: 'wayli',
				limit: 1
			});

			if (result?.conversations && result.conversations.length > 0) {
				const existingId = result.conversations[0]?.id;
				if (existingId) {
					await chatService.startChat('trip-planner', 'wayli', existingId);
					const convo = await chatService.getConversation(existingId);
					if (convo?.messages && Array.isArray(convo.messages) && convo.messages.length > 0) {
						messages = convo.messages
							.map((m: any) => ({
								role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
								content: String(m.content || m.text || '')
							}))
							.filter((m) => m.content);
						if (messages.length > 0) {
							scrollToBottom();
							return;
						}
					}
				}
			}
		} catch {
			// Connection failed — chat will work on first send
		}
		showGreeting();
	});

	function showGreeting() {
		const lang = get(currentLocale) || 'en';
		if (planItems.length > 0) {
			if (lang === 'nl') {
				messages = [
					{
						role: 'assistant',
						content: `Hoi! Ik ben je reisplanner. Ik zie dat je al ${planItems.length} activiteit(en) gepland hebt. Vraag me om suggesties voor de open plekken!`
					}
				];
			} else {
				messages = [
					{
						role: 'assistant',
						content: `Hi! I'm your trip planning assistant. I can see you already have ${planItems.length} item(s) planned. Ask me to suggest more activities or fill empty days!`
					}
				];
			}
		} else {
			if (lang === 'nl') {
				messages = [
					{
						role: 'assistant',
						content: `Hoi! Ik ben je reisplanner voor je ${numDays}-daagse trip naar ${primaryCity || tripTitle}. Vraag me om een reisroute of activiteiten!`
					}
				];
			} else {
				messages = [
					{
						role: 'assistant',
						content: `Hi! I'm your trip planning assistant for your ${numDays}-day trip to ${primaryCity || tripTitle}. Ask me for an itinerary or activities!`
					}
				];
			}
		}
	}

	onDestroy(() => {
		chatService?.disconnect();
	});

	function scrollToBottom() {
		setTimeout(() => {
			if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}, 50);
	}

	function copyMessage(idx: number) {
		const msg = messages[idx];
		if (!msg) return;
		navigator.clipboard.writeText(msg.content);
		copiedIdx = idx;
		setTimeout(() => (copiedIdx = null), 2000);
	}

	async function send() {
		if (!input.trim() || isSending || !chatService) return;
		const userMsg = input.trim();
		messages = [...messages, { role: 'user', content: userMsg }];
		input = '';
		isSending = true;
		scrollToBottom();

		try {
			if (!chatService.isConnected()) {
				await chatService.connect({
					onContent: (_delta, full) => {
						const lastIdx = messages.length - 1;
						if (messages[lastIdx]?.role === 'assistant') {
							messages[lastIdx].content = full;
							messages = [...messages];
							scrollToBottom();
						}
					},
					onDone: () => {
						isSending = false;
					},
					onError: (error) => {
						console.error('Chat error:', error);
						const lastIdx = messages.length - 1;
						if (messages[lastIdx]?.role === 'assistant') {
							messages[lastIdx].content = t('plannerChat.error');
							messages = [...messages];
						}
						isSending = false;
					}
				});
				await chatService.startChat('trip-planner', 'wayli');
			}

			messages = [...messages, { role: 'assistant', content: '...' }];
			const isFirstMessage = messages.filter((m) => m.role === 'user').length === 1;
			const msgToSend = isFirstMessage ? `${SYSTEM_CONTEXT}\n\n${userMsg}` : userMsg;
			await chatService.sendMessage(msgToSend);
		} catch (err) {
			console.error('Send failed:', err);
			messages = [
				...messages.filter((m) => m.content !== '...'),
				{ role: 'assistant', content: t('plannerChat.connectionError') }
			];
			isSending = false;
		}
		scrollToBottom();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			send();
		}
	}
</script>

<div class="flex h-full flex-col">
	<div bind:this={scrollContainer} class="flex-1 space-y-4 overflow-y-auto p-4">
		{#each messages as msg, i (i)}
			{#if msg.role === 'user'}
				<div class="flex justify-end">
					<div
						class="bg-primary text-primary-foreground max-w-[80%] rounded-2xl rounded-br-sm px-4 py-2 text-sm"
					>
						{msg.content}
					</div>
				</div>
			{:else}
				{@const suggestions = extractSuggestions(msg.content)}
				{@const displayContent = stripJsonBlocks(msg.content)}
				<div class="flex justify-start">
					<div class="max-w-[90%]">
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
										onclick={() => onAcceptItem?.(sug)}
										class="bg-primary/10 hover:bg-primary/20 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors"
									>
										<Plus class="h-3 w-3" />
										{sug.title.slice(0, 25)}{sug.title.length > 25 ? '…' : ''}
										<span class="text-muted-foreground">→ {t('common.day')} {sug.day}</span>
									</button>
								{/each}
							</div>
						{/if}
						<div class="mt-1 flex items-center gap-2">
							<button
								type="button"
								onclick={() => copyMessage(i)}
								class="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-[10px] transition-colors"
							>
								{#if copiedIdx === i}
									<Check class="h-3 w-3" /> {t('plannerChat.copied')}
								{:else}
									<Copy class="h-3 w-3" /> {t('plannerChat.copy')}
								{/if}
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/each}
	</div>

	<div class="border-border flex items-center gap-2 border-t p-3">
		<input
			type="text"
			bind:value={input}
			onkeydown={handleKeydown}
			placeholder={t('plannerChat.placeholder')}
			class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
			disabled={isSending}
		/>
		<button
			type="button"
			onclick={send}
			disabled={isSending || !input.trim()}
			class="bg-primary hover:bg-primary/90 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-primary-foreground transition-colors disabled:opacity-50"
		>
			{#if isSending}
				<Loader2 class="h-4 w-4 animate-spin" />
			{:else}
				<Send class="h-4 w-4" />
			{/if}
		</button>
	</div>
</div>
