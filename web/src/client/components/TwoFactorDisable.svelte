<script lang="ts">
	import { AlertTriangle, X, Lock } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';

	import { ServiceAdapter } from '$lib/services/api/service-adapter';
	import { supabase } from '$lib/supabase';

	export let open = false;
	export let onDisabled: (() => void) | undefined = undefined;
	export let onClose: (() => void) | undefined = undefined;

	let password = '';
	let isDisabling = false;

	async function handleDisable2FA() {
		if (!password) {
			toast.error('Please enter your password');
			return;
		}

		isDisabling = true;
		try {
			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) throw new Error('No session found');

			const serviceAdapter = new ServiceAdapter({ session });
			await serviceAdapter.disable2FA(password);

			toast.success('Two-factor authentication disabled successfully');
			// Disable 2FA
			if (onDisabled) {
				onDisabled();
			}
			closeModal();
		} catch (error) {
			console.error('Error disabling 2FA:', error);
			toast.error(
				'Failed to disable 2FA: ' + (error instanceof Error ? error.message : 'Unknown error')
			);
		} finally {
			isDisabling = false;
		}
	}

	function closeModal() {
		open = false;
		password = '';
		if (onClose) {
			onClose();
		}
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="presentation"
		aria-hidden="true"
	>
		<!-- Modal -->
		<div
			class="w-full max-w-md rounded-lg bg-white shadow-xl dark:bg-gray-800"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && closeModal()}
			aria-modal="true"
			role="dialog"
			aria-labelledby="two-factor-disable-modal-title"
			aria-describedby="two-factor-disable-modal-description"
			tabindex="0"
		>
			<!-- Header -->
			<div
				class="flex items-center justify-between border-b border-gray-200 p-6 dark:border-gray-700"
			>
				<div class="flex items-center gap-3">
					<AlertTriangle class="h-6 w-6 text-red-500" />
					<h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
						Disable Two-Factor Authentication
					</h2>
				</div>
				<button
					onclick={closeModal}
					class="cursor-pointer rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
				>
					<X class="h-5 w-5" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-6">
				<div class="mb-6">
					<div
						class="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20"
					>
						<AlertTriangle class="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
						<div>
							<h3 class="mb-1 font-medium text-red-800 dark:text-red-200">Security Warning</h3>
							<p class="text-sm text-red-700 dark:text-red-300">
								Disabling two-factor authentication will make your account less secure. You'll only
								need your password to sign in.
							</p>
						</div>
					</div>
				</div>

				<div class="mb-6">
					<label
						for="disablePassword"
						class="mb-1.5 block text-sm font-medium text-gray-900 dark:text-gray-100"
					>
						Enter Your Password
					</label>
					<div class="relative">
						<Lock
							class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-gray-400"
						/>
						<input
							id="disablePassword"
							type="password"
							bind:value={password}
							placeholder="Enter your password to confirm"
							class="w-full rounded-md border border-gray-300 bg-white py-2 pr-3 pl-10 text-gray-900 focus:border-red-500 focus:ring-1 focus:ring-red-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
						/>
					</div>
					<p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
						You must enter your password to disable two-factor authentication.
					</p>
				</div>

				<!-- Action Buttons -->
				<div class="flex gap-3">
					<button
						onclick={closeModal}
						class="flex-1 cursor-pointer rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
					>
						Cancel
					</button>
					<button
						onclick={handleDisable2FA}
						disabled={isDisabling || !password}
						class="flex-1 cursor-pointer rounded-md bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isDisabling ? 'Disabling...' : 'Disable 2FA'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
