<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Send, Loader2, Plus } from 'lucide-svelte';
	import { ChatService } from '$lib/services/chat.service';
	import { renderMarkdown } from '$lib/utils/markdown';

	type Props = {
		tripId: string;
		tripTitle: string;
		startDate: string;
		endDate: string;
		primaryCity?: string;
		numDays: number;
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
		onAcceptItem
	}: Props = $props();

	// Parse AI response for suggested plan items
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
		// Match patterns like: "**Day 1:**" or "Day 1:" followed by bullet items
		const dayRegex = /\*?\*?Day\s+(\d+)\*?\*?\s*:?/gi;
		const lines = content.split('\n');
		let currentDay = 0;

		for (const line of lines) {
			const dayMatch = line.match(/Day\s+(\d+)/i);
			if (dayMatch) {
				currentDay = parseInt(dayMatch[1]);
				continue;
			}

			// Match bullet items with emoji icons
			// e.g. "- 📷 Morning: Eiffel Tower (sightseeing, ~€17, 2h)"
			// e.g. "- 🍴 Le Bistro (food, ~€25, 1h)"
			const itemMatch = line.match(
				/^[-•*]\s*(?:([📷🍴🎯🚇🏨☕🛍️])\s*)?(?:(Morning|Afternoon|Evening|Lunch|Dinner|Night)\s*[:–-]\s*)?(.+?)(?:\s*\(([^)]+)\))?\s*$/
			);
			if (itemMatch && currentDay > 0) {
				const icon = itemMatch[1];
				const timeOfDay = itemMatch[2];
				let title = itemMatch[3]?.trim() || '';
				const details = itemMatch[4] || '';

				if (!title || title.length < 2) continue;

				// Strip trailing parenthetical classifiers like "(fun, relaxed)"
				title = title.replace(/\s*\([^)]*\)\s*$/g, '').trim();

				// Determine type from icon
				const typeMap: Record<string, string> = {
					'📷': 'sightseeing',
					'🍴': 'food',
					'🎯': 'activity',
					'🚇': 'transport',
					'🏨': 'accommodation',
					'☕': 'rest',
					'🛍️': 'shopping'
				};

				// Also detect type from details text
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

				// Extract cost from details: "€17", "$25", "¥1000"
				const costMatch = details.match(/[€$¥£](\d+(?:\.\d+)?)/);
				const currencyMatch = details.match(/[€$¥£]/);

				// Extract time from timeOfDay
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

	let messages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
	let input = $state('');
	let isSending = $state(false);
	let scrollContainer: HTMLElement | null = $state(null);
	let chatService: ChatService | null = null;

	const SYSTEM_CONTEXT = `Planning trip: ${tripTitle} (${startDate} to ${endDate}), ${numDays} days${primaryCity ? `, destination: ${primaryCity}` : ''}. Trip ID: ${tripId}`;

	onMount(() => {
		messages = [
			{
				role: 'assistant',
				content: `Hi! I'm your trip planning assistant. I can help you plan your ${numDays}-day trip to ${primaryCity || tripTitle}. Ask me to suggest an itinerary, find activities, or balance your days!`
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
			// Connect if not already connected
			if (!chatService.isConnected()) {
				await chatService.connect({
					onContent: (_delta, full) => {
						// Update the last assistant message in real-time
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

				// Start conversation with trip-planner chatbot
				// Send system context as part of the first message
				await chatService.startChat('trip-planner', 'wayli');
			}

			// Add placeholder for assistant response
			messages = [...messages, { role: 'assistant', content: '...' }];

			// Send the message (include context on first message)
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
				{@const suggestions = parseSuggestions(msg.content)}
				<div class="flex justify-start">
					<div class="max-w-[85%] space-y-2">
						<div
							class="prose prose-sm dark:prose-invert bg-muted text-foreground overflow-hidden rounded-2xl rounded-bl-sm px-4 py-2 text-sm"
						>
							{#if msg.content === '...'}
								<Loader2 class="text-muted-foreground h-4 w-4 animate-spin" />
							{:else}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html renderMarkdown(msg.content)}
							{/if}
						</div>
						{#if suggestions.length > 0 && msg.content !== '...'}
							<div class="flex flex-wrap gap-1.5">
								{#each suggestions as sug, sugIdx (sugIdx)}
									<button
										type="button"
										onclick={() => onAcceptItem?.(sug)}
										class="bg-primary/10 hover:bg-primary/20 text-primary inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors"
										title={`Add "${sug.title}" to Day ${sug.day}`}
									>
										<Plus class="h-3 w-3" />
										Day {sug.day}: {sug.title.slice(0, 25)}{sug.title.length > 25 ? '…' : ''}
									</button>
								{/each}
							</div>
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
