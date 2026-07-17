<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Send, Sparkles, Loader2, X, Plus } from 'lucide-svelte';

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

	let messages = $state<Array<{ role: 'user' | 'assistant'; content: string }>>([]);
	let input = $state('');
	let isSending = $state(false);
	let conversationId: string | null = null;
	let ws: WebSocket | null = null;
	let scrollContainer: HTMLElement | null = $state(null);

	const SYSTEM_CONTEXT = `Planning trip: ${tripTitle} (${startDate} to ${endDate}), ${numDays} days${primaryCity ? `, destination: ${primaryCity}` : ''}. Trip ID: ${tripId}`;

	onMount(() => {
		messages = [
			{
				role: 'assistant',
				content: `Hi! I'm your trip planning assistant. I can help you plan your ${numDays}-day trip to ${primaryCity || tripTitle}. Ask me to suggest an itinerary, find activities, or balance your days!`
			}
		];
	});

	onDestroy(() => {
		ws?.close();
	});

	function scrollToBottom() {
		setTimeout(() => {
			if (scrollContainer) {
				scrollContainer.scrollTop = scrollContainer.scrollHeight;
			}
		}, 50);
	}

	async function send() {
		if (!input.trim() || isSending) return;

		const userMsg = input.trim();
		messages = [...messages, { role: 'user', content: userMsg }];
		input = '';
		isSending = true;
		scrollToBottom();

		try {
			const wsUrl =
				(import.meta.env.VITE_FLUXBASE_URL || 'http://localhost:8080').replace('http', 'ws') +
				'/ai/ws';

			if (!ws || ws.readyState !== WebSocket.OPEN) {
				ws = new WebSocket(wsUrl);
				await new Promise((resolve, reject) => {
					ws!.onopen = resolve;
					ws!.onerror = reject;
					setTimeout(() => reject(new Error('timeout')), 5000);
				});
			}

			// Start conversation if needed
			if (!conversationId) {
				const startMsg = {
					type: 'start_chat',
					chatbot: 'trip-planner',
					namespace: 'wayli',
					message: SYSTEM_CONTEXT
				};
				ws.send(JSON.stringify(startMsg));

				const startResponse = await new Promise<any>((resolve, reject) => {
					const handler = (event: MessageEvent) => {
						ws!.removeEventListener('message', handler);
						const data = JSON.parse(event.data);
						resolve(data);
					};
					ws!.addEventListener('message', handler);
					setTimeout(() => reject(new Error('timeout')), 10000);
				});

				if (startResponse.conversation_id) {
					conversationId = startResponse.conversation_id;
				} else if (startResponse.content) {
					conversationId = startResponse.conversation_id || 'temp';
				}
			}

			// Send user message
			const sendMsg = {
				type: 'send_message',
				conversation_id: conversationId,
				message: userMsg
			};

			let assistantContent = '';
			const responsePromise = new Promise<void>((resolve) => {
				const handler = (event: MessageEvent) => {
					const data = JSON.parse(event.data);

					if (data.type === 'content') {
						assistantContent += data.content || '';
						// Update the last assistant message in real-time
						const lastIdx = messages.length - 1;
						if (messages[lastIdx]?.role === 'assistant' && messages[lastIdx].content === '...') {
							messages[lastIdx].content = assistantContent;
							messages = [...messages];
							scrollToBottom();
						}
					} else if (data.type === 'done') {
						ws!.removeEventListener('message', handler);
						if (assistantContent && messages[messages.length - 1]?.content === '...') {
							messages[messages.length - 1].content = assistantContent;
							messages = [...messages];
						}
						resolve();
					} else if (data.type === 'error') {
						ws!.removeEventListener('message', handler);
						if (messages[messages.length - 1]?.content === '...') {
							messages[messages.length - 1].content =
								'Sorry, I had trouble processing that. Please try again.';
							messages = [...messages];
						}
						resolve();
					}
				};
				ws!.addEventListener('message', handler);
			});

			ws.send(JSON.stringify(sendMsg));
			messages = [...messages, { role: 'assistant', content: '...' }];
			await responsePromise;
			scrollToBottom();
		} catch (err) {
			console.error('Chat error:', err);
			messages = [
				...messages,
				{
					role: 'assistant',
					content:
						'Sorry, I could not connect to the AI service. Make sure AI is configured in your server settings.'
				}
			];
		} finally {
			isSending = false;
		}
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
					<div
						class="bg-muted text-foreground max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-bl-sm px-4 py-2 text-sm"
					>
						{#if msg.content === '...'}
							<Loader2 class="text-muted-foreground h-4 w-4 animate-spin" />
						{:else}
							{msg.content}
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
