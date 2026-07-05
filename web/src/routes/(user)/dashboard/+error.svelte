<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Alert } from '$lib/components/ui';
</script>

<div class="flex min-h-[60vh] items-center justify-center p-6">
	<div class="w-full max-w-md space-y-4">
		<Alert variant="error" title={page.status ? `Error ${page.status}` : 'Something went wrong'}>
			<p>{page.error?.message ?? 'An unexpected error occurred. Please try again.'}</p>
		</Alert>
		<div class="flex justify-center">
			<button
				type="button"
				onclick={() => goto('/dashboard')}
				class="bg-primary hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium text-primary-foreground transition-colors"
			>
				Back to dashboard
			</button>
		</div>
	</div>
</div>
