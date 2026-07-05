<script lang="ts">
	import type { Component } from 'svelte';
	import { AlertTriangle } from 'lucide-svelte';

	import Modal from '$lib/components/ui/modal/index.svelte';

	interface Props {
		open?: boolean;
		title?: string;
		message?: string;
		confirmText?: string;
		cancelText?: string;
		variant?: 'danger' | 'warning' | 'info';
		icon?: Component;
		onConfirm?: () => void;
		onCancel?: () => void;
	}

	let {
		open = false,
		title = 'Confirm Action',
		message = 'Are you sure you want to proceed?',
		confirmText = 'Confirm',
		cancelText = 'Cancel',
		variant = 'warning',
		icon = AlertTriangle,
		onConfirm,
		onCancel
	}: Props = $props();

	const variantConfig = {
		danger: {
			iconClass: 'text-destructive',
			bgClass: 'bg-destructive/10',
			buttonClass: 'bg-destructive hover:bg-destructive/90 text-destructive-foreground'
		},
		warning: {
			iconClass: 'text-warning',
			bgClass: 'bg-warning/10',
			buttonClass: 'bg-warning hover:bg-warning/90 text-white'
		},
		info: {
			iconClass: 'text-primary',
			bgClass: 'bg-primary/10',
			buttonClass: 'bg-primary hover:bg-primary/90 text-primary-foreground'
		}
	};

	const Icon = $derived(icon);
</script>

<Modal {open} title="" size="sm" showCloseButton={false} onClose={onCancel}>
	<div class="space-y-4 text-center">
		<!-- Icon -->
		<div
			class="mx-auto flex h-12 w-12 items-center justify-center rounded-full {variantConfig[variant]
				.bgClass}"
		>
			<Icon class="h-6 w-6 {variantConfig[variant].iconClass}" />
		</div>

		<!-- Content -->
		<div>
			<h3 class="text-foreground mb-2 text-lg font-medium">
				{title}
			</h3>
			<p class="text-muted-foreground text-sm">
				{message}
			</p>
		</div>

		<!-- Action Buttons -->
		<div class="flex gap-3 pt-4">
			<button
				type="button"
				onclick={onCancel}
				class="border-border text-foreground hover:bg-muted flex-1 rounded-lg border bg-transparent px-4 py-2 text-sm font-medium transition-colors"
			>
				{cancelText}
			</button>
			<button
				type="button"
				onclick={onConfirm}
				class="flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors {variantConfig[
					variant
				].buttonClass}"
			>
				{confirmText}
			</button>
		</div>
	</div>
</Modal>
