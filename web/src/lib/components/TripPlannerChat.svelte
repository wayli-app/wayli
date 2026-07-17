<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Send, Loader2, Plus } from 'lucide-svelte';
	import { ChatService } from '$lib/services/chat.service';
	import { renderMarkdown } from '$lib/utils/markdown';
	import type { PlanItem } from '$lib/services/trip-plan.service';

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

	function parseSuggestions(content: string): ParsedSuggestion[] {
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

				const typeKeywords: Record<string, string[]> = {
					sightseeing: [
						'sightseeing',
						'museum',
						'monument',
						'landmark',
						'temple',
						'cathedral',
						'palace'
					],
					food: ['food', 'restaurant', 'lunch', 'dinner', 'breakfast', 'café', 'cafe', 'bar'],
					activity: ['activity', 'tour', 'park', 'garden', 'beach'],
					transport: ['transport', 'train', 'bus', 'metro', 'taxi', 'flight'],
					accommodation: ['accommodation', 'hotel', 'hostel', 'airbnb', 'stay'],
					rest: ['rest', 'coffee', 'break'],
					shopping: ['shopping', 'market', 'shop']
				};
				const detailsLower = details.toLowerCase();
				let detectedType = typeMap[icon || ''] || '';
				if (!detectedType) {
					for (const [type, keywords] of Object.entries(typeKeywords)) {
						if (keywords.some((kw) => detailsLower.includes(kw))) {
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
					type: detectedType || 'activity',
					cost: costMatch ? parseFloat(costMatch[1]) : undefined,
					currency: currencyMatch ? currencyMatch[0] : undefined,
					time: timeOfDay ? timeMap[timeOfDay] : undefined
				});
			}
		}
		return suggestions;
	}

	// Split content into segments: text blocks and inline suggestions
	type Segment = { type: 'text'; html: string } | { type: 'suggestion'; sug: ParsedSuggestion };

	function renderWithInlineSuggestions(content: string): Segment[] {
		const suggestions = parseSuggestions(content);
		if (suggestions.length === 0) {
			return [{ type: 'text', html: renderMarkdown(content) }];
		}

		// Split content by lines, find suggestion lines, group into segments
		const lines = content.split('\n');
		const segments: Segment[] = [];
		let textBuffer: string[] = [];
		let currentDay = 0;
		const usedSuggestions = [...suggestions];
		let sugIdx = 0;

		for (const line of lines) {
			const dayMatch = line.match(/Day\s+(\d+)/i);
			if (dayMatch && !line.match(/^[-•*]/)) {
				currentDay = parseInt(dayMatch[1]);
				textBuffer.push(line);
				continue;
			}

			// Check if this line is a suggestion
			const isSuggestionLine =
				line.match(
					/^[-•*]\s*(?:[📷🍴🎯🚇🏨☕🛍️])?\s*(?:(?:Morning|Afternoon|Evening|Lunch|Dinner|Night)\s*[:–-]\s*)?.+/i
				) &&
				currentDay > 0 &&
				sugIdx < usedSuggestions.length &&
				usedSuggestions[sugIdx].day === currentDay;

			if (isSuggestionLine) {
				// Flush text buffer
				if (textBuffer.length > 0) {
					segments.push({ type: 'text', html: renderMarkdown(textBuffer.join('\n')) });
					textBuffer = [];
				}
				// Add suggestion
				segments.push({ type: 'suggestion', sug: usedSuggestions[sugIdx] });
				sugIdx++;
			} else {
				textBuffer.push(line);
			}
		}

		// Flush remaining text
		if (textBuffer.length > 0) {
			segments.push({ type: 'text', html: renderMarkdown(textBuffer.join('\n')) });
		}

		return segments;
	}

	let messages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
	let input = $state('');
	let isSending = $state(false);
	let scrollContainer: HTMLElement | null = $state(null);
	let chatService: ChatService | null = null;

	// Build plan summary for context
	const planSummary = $derived.by(() => {
		if (planItems.length === 0) return 'No items planned yet.';
		const byDay = new Map<number, PlanItem[]>();
		for (const item of planItems) {
			const d = item.day_number || 1;
			if (!byDay.has(d)) byDay.set(d, []);
			byDay.get(d)!.push(item);
		}
		const lines: string[] = [];
		for (const [day, items] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
			lines.push(`Day ${day}:`);
			for (const item of items) {
				const time = item.start_time ? ` ${item.start_time}` : '';
				const cost = item.cost_estimate ? ` (${item.currency || ''}${item.cost_estimate})` : '';
				lines.push(`  -${time} ${item.title} [${item.type}]${cost}`);
			}
		}
		return lines.join('\n');
	});

	const SYSTEM_CONTEXT = `Planning trip: ${tripTitle} (${startDate} to ${endDate}), ${numDays} days${primaryCity ? `, destination: ${primaryCity}` : ''}. Trip ID: ${tripId}

CURRENT PLAN:
${planSummary}`;

	onMount(() => {
		messages = [
			{
				role: 'assistant',
				content: `Hi! I'm your trip planning assistant. I can help you plan your ${numDays}-day trip to ${primaryCity || tripTitle}.${planItems.length > 0 ? ` I can see you already have ${planItems.length} item(s) planned. Ask me to suggest more activities, optimize your schedule, or fill in empty days!` : ' Ask me to suggest an itinerary, find activities, or balance your days!'}`
			}
		];

		chatService = new ChatService();
	});

	onDestroy(() => {
		chatService?.disconnect();
	});

	function scrollToBottom() {
		setTimeout(() => {
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}
		}, 50);
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
							messages[lastIdx].content = 'Sorry, I had trouble processing that. Please try again.';
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
				{
					role: 'assistant',
					content: `Sorry, I could not connect to the AI service. Make sure AI is configured in your server settings. Error: ${err instanceof Error ? err.message : 'Unknown'}`
				}
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
	<!-- Messages -->
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
				<div class="flex justify-start">
					<div class="max-w-[90%] space-y-1">
						{#if msg.content === '...'}
							<div class="bg-muted text-foreground rounded-2xl rounded-bl-sm px-4 py-2">
								<Loader2 class="text-muted-foreground h-4 w-4 animate-spin" />
							</div>
						{:else}
							{@const segments = renderWithInlineSuggestions(msg.content)}
							{#each segments as seg, segIdx (segIdx)}
								{#if seg.type === 'text'}
									<!-- eslint-disable-next-line svelte/no-at-html-tags -->
									{@html seg.html}
								{:else}
									<div class="my-1 pl-4">
										<button
											type="button"
											onclick={() => onAcceptItem?.(seg.sug)}
											class="bg-primary/10 hover:bg-primary/20 text-primary inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-medium transition-colors"
											title={`Add "${seg.sug.title}" to Day ${seg.sug.day}`}
										>
											<Plus class="h-3 w-3" />
											{seg.sug.title.slice(0, 30)}{seg.sug.title.length > 30 ? '…' : ''}
											<span class="text-muted-foreground ml-1">→ Day {seg.sug.day}</span>
										</button>
									</div>
								{/if}
							{/each}
						{/if}
					</div>
				</div>
			{/if}
		{/each}
	</div>

	<!-- Input -->
	<div class="border-border flex items-center gap-2 border-t p-3">
		<input
			type="text"
			bind:value={input}
			onkeydown={handleKeydown}
			placeholder="Ask for itinerary suggestions..."
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
