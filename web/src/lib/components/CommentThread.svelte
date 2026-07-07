<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { fluxbase } from '$lib/fluxbase';
	import { userStore } from '$lib/stores/auth';
	import { listComments, createComment, deleteComment } from '$lib/services/social.service';
	import type { TripComment } from '$lib/types/social.types';
	import { Send, Trash2, Loader2, MessageCircle } from 'lucide-svelte';

	type Props = {
		tripId: string;
	};

	let { tripId }: Props = $props();

	let comments = $state<TripComment[]>([]);
	let isLoading = $state(true);
	let commentBody = $state('');
	let isSubmitting = $state(false);

	onMount(async () => {
		await loadComments();
	});

	async function loadComments() {
		isLoading = true;
		try {
			comments = await listComments(tripId);
		} catch (err) {
			console.error('Failed to load comments:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleSubmit() {
		if (!commentBody.trim() || !$userStore?.id) return;
		isSubmitting = true;
		try {
			const created = await createComment($userStore.id, tripId, commentBody.trim());
			created.author_name = $userStore.full_name ?? null;
			created.author_avatar = $userStore.avatar_url ?? null;
			comments = [...comments, created];
			commentBody = '';
		} catch (err) {
			console.error('Failed to post comment:', err);
		} finally {
			isSubmitting = false;
		}
	}

	async function handleDelete(commentId: string) {
		if (!confirm('Delete this comment?')) return;
		try {
			await deleteComment(commentId);
			comments = comments.filter((c) => c.id !== commentId);
		} catch (err) {
			console.error('Failed to delete comment:', err);
		}
	}

	function timeAgo(dateStr: string): string {
		const diff = Date.now() - new Date(dateStr).getTime();
		const mins = Math.floor(diff / 60000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours}h ago`;
		const days = Math.floor(hours / 24);
		if (days < 7) return `${days}d ago`;
		return new Date(dateStr).toLocaleDateString();
	}

	// Can the current user delete this comment?
	function canDelete(comment: TripComment): boolean {
		if (!$userStore?.id) return false;
		return comment.user_id === $userStore.id; // commenter OR trip owner (RLS allows both)
	}
</script>

<div class="space-y-4">
	<h3 class="text-foreground flex items-center gap-2 text-sm font-semibold">
		<MessageCircle class="h-4 w-4" />
		{comments.length}
		{comments.length === 1 ? 'comment' : 'comments'}
	</h3>

	{#if isLoading}
		<p class="text-muted-foreground text-sm">Loading comments...</p>
	{:else if comments.length === 0}
		<p class="text-muted-foreground text-sm">No comments yet. Be the first!</p>
	{:else}
		<div class="space-y-3">
			{#each comments as comment (comment.id)}
				<div class="bg-muted/50 rounded-lg p-3">
					<div class="mb-1 flex items-center gap-2">
						{#if comment.author_avatar}
							<img src={comment.author_avatar} alt="" class="h-6 w-6 rounded-full object-cover" />
						{/if}
						<span class="text-foreground text-sm font-medium">
							{comment.author_name ?? 'Anonymous'}
						</span>
						<span class="text-muted-foreground text-xs">{timeAgo(comment.created_at)}</span>
						{#if canDelete(comment)}
							<button
								type="button"
								onclick={() => handleDelete(comment.id)}
								class="text-muted-foreground hover:text-destructive ml-auto rounded p-1 transition-colors"
								aria-label="Delete comment"><Trash2 class="h-3.5 w-3.5" /></button
							>
						{/if}
					</div>
					<p class="text-foreground text-sm leading-relaxed">{comment.body}</p>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Comment form (authenticated users only) -->
	{#if $userStore?.id}
		<div class="flex gap-2">
			<input
				type="text"
				bind:value={commentBody}
				placeholder="Write a comment..."
				onkeydown={(e) => e.key === 'Enter' && handleSubmit()}
				class="border-border focus:ring-primary flex-1 rounded-lg border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:outline-none"
			/>
			<button
				type="button"
				onclick={handleSubmit}
				disabled={isSubmitting || !commentBody.trim()}
				class="bg-primary hover:bg-primary/90 rounded-lg p-2 text-primary-foreground transition-colors disabled:opacity-50"
				aria-label="Post comment"
			>
				{#if isSubmitting}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<Send class="h-4 w-4" />
				{/if}
			</button>
		</div>
	{/if}
</div>
