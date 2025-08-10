<script lang="ts">
    import { cn } from '$lib/utils';

    type ButtonVariants = {
        variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
        size?: 'default' | 'sm' | 'lg' | 'icon';
    };

    const buttonVariants = {
        size: {
            default: 'h-10 px-4 py-2',
            sm: 'h-9 rounded-md px-3',
            lg: 'h-11 rounded-md px-8',
            icon: 'h-10 w-10'
        }
    } as const;

    // Typed runes props so all are optional for consumers/tests
    type ButtonProps = {
        variant?: ButtonVariants['variant'];
        size?: ButtonVariants['size'];
        disabled?: boolean;
        loading?: boolean;
        type?: 'button' | 'submit' | 'reset';
        as?: 'button' | 'a';
        href?: string;
        icon?: string;
        children?: string;
        on?: { click?: (e: MouseEvent | KeyboardEvent) => void };
        bind?: (el: HTMLButtonElement | HTMLAnchorElement) => void;
        class?: string;
        [key: string]: unknown;
    };

    let {
        variant = 'default',
        size = 'default',
        disabled = false,
        loading = false,
        type = 'button',
        as = 'button',
        href,
        icon,
        children,
        on,
        bind,
        class: parentClass = ''
    }: ButtonProps = $props();

    let element = $state<HTMLButtonElement | HTMLAnchorElement>();

    // Compute element tag
    const elementTag = $derived(as === 'a' ? 'a' : 'button');

    // Ensure variant and size have valid values
    const buttonVariant = $derived(variant);
    const buttonSize = $derived(size);
    const isDisabled = $derived(!!(disabled || loading));
    $effect(() => { if (bind && element) bind(element); });

    const baseClass =
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none';
    // Classes

    function getVariantClasses(v: ButtonVariants['variant']): string {
        switch (v) {
            case 'destructive':
                return 'bg-destructive text-destructive-foreground';
            case 'outline':
                return 'border border-input bg-background';
            case 'secondary':
                return 'bg-secondary text-secondary-foreground';
            case 'ghost':
                return 'hover:bg-accent hover:text-accent-foreground';
            case 'link':
                return 'text-primary underline-offset-4';
            default:
                return 'bg-primary text-primary-foreground';
        }
    }

    function getSizeClasses(s: ButtonVariants['size']): string {
        switch (s) {
            case 'sm':
                return buttonVariants.size.sm;
            case 'lg':
                return buttonVariants.size.lg;
            case 'icon':
                return buttonVariants.size.icon;
            default:
                return buttonVariants.size.default;
        }
    }

    const computedClass = $derived(cn(
        baseClass,
        getVariantClasses(buttonVariant),
        getSizeClasses(buttonSize),
        isDisabled && 'pointer-events-none opacity-50',
        parentClass
    ));

    function handleClick(event: MouseEvent) {
        if (isDisabled) {
            event.preventDefault();
            return;
        }
        on?.click?.(event);
    }

    function handleKeydown(event: KeyboardEvent) {
        if (isDisabled) return;
        if (event.key === ' ' || event.key === 'Enter') {
            on?.click?.(event);
        }
    }
</script>

{#key `${as}:${variant}:${size}`}
    {#if as === 'a'}
        <a
            bind:this={element}
            href={href}
            data-variant={variant}
            data-size={size}
            aria-disabled={isDisabled ? 'true' : undefined}
            class={computedClass}
            onclick={handleClick}
            onkeydown={handleKeydown}
        >
            {#if loading}
                <span data-testid="loading-spinner" class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            {/if}
            {#if icon}
                <span class="mr-2">{icon}</span>
            {/if}
            <slot>{children}</slot>
        </a>
    {:else}
        <button
            bind:this={element as HTMLButtonElement}
            type={type}
            data-variant={variant}
            data-size={size}
            disabled={isDisabled}
            class={computedClass}
            onclick={handleClick}
            onkeydown={handleKeydown}
        >
            {#if loading}
                <span data-testid="loading-spinner" class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            {/if}
            {#if icon}
                <span class="mr-2">{icon}</span>
            {/if}
            <slot>{children}</slot>
        </button>
    {/if}
{/key}
