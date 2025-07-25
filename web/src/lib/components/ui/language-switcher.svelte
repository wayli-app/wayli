<!-- src/lib/components/ui/language-switcher.svelte -->
<script lang="ts">
  import { currentLocale, SUPPORTED_LOCALES, type SupportedLocale } from '$lib/i18n';
  import { useAriaButton } from '$lib/accessibility/aria-button';
  import { ChevronDown, Globe } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';

  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let variant: 'button' | 'select' = 'button';
  export let showLabel = true;

  const dispatch = createEventDispatcher<{
    change: { locale: SupportedLocale };
  }>();

  let isOpen = false;
  let buttonElement: HTMLButtonElement;
  let dropdownElement: HTMLDivElement;

  const { buttonProps } = useAriaButton({
    expanded: isOpen,
    controls: 'language-dropdown',
    disabled: false
  });

  const localeNames: Record<SupportedLocale, string> = {
    en: 'English',
    nl: 'Nederlands'
  };

  const localeFlags: Record<SupportedLocale, string> = {
    en: '🇺🇸',
    nl: '🇳🇱'
  };

  function toggleDropdown() {
    isOpen = !isOpen;
  }

  function selectLocale(locale: SupportedLocale) {
    currentLocale.set(locale);
    isOpen = false;
    dispatch('change', { locale });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      isOpen = false;
    }
  }

  // Close dropdown when clicking outside
  function handleClickOutside(event: MouseEvent) {
    if (
      buttonElement &&
      dropdownElement &&
      !buttonElement.contains(event.target as Node) &&
      !dropdownElement.contains(event.target as Node)
    ) {
      isOpen = false;
    }
  }

  // Handle click outside
  if (typeof window !== 'undefined') {
    window.addEventListener('click', handleClickOutside);
  }
</script>

<svelte:head>
  <style>
    .language-switcher {
      position: relative;
      display: inline-block;
    }

    .language-button {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--border-color, #e5e7eb);
      border-radius: 0.375rem;
      background: var(--bg-color, #ffffff);
      color: var(--text-color, #374151);
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .language-button:hover {
      background: var(--hover-bg-color, #f9fafb);
      border-color: var(--hover-border-color, #d1d5db);
    }

    .language-button:focus {
      outline: 2px solid var(--focus-color, #3b82f6);
      outline-offset: 2px;
    }

    .language-button[aria-expanded="true"] {
      background: var(--active-bg-color, #f3f4f6);
      border-color: var(--active-border-color, #9ca3af);
    }

    .dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 50;
      min-width: 8rem;
      margin-top: 0.25rem;
      padding: 0.5rem 0;
      background: var(--dropdown-bg-color, #ffffff);
      border: 1px solid var(--dropdown-border-color, #e5e7eb);
      border-radius: 0.375rem;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      opacity: 0;
      visibility: hidden;
      transform: translateY(-0.5rem);
      transition: all 0.2s ease;
    }

    .dropdown[data-visible="true"] {
      opacity: 1;
      visibility: visible;
      transform: translateY(0);
    }

    .locale-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem 0.75rem;
      border: none;
      background: none;
      color: var(--option-text-color, #374151);
      font-size: 0.875rem;
      text-align: left;
      cursor: pointer;
      transition: background-color 0.2s ease;
    }

    .locale-option:hover {
      background: var(--option-hover-bg-color, #f9fafb);
    }

    .locale-option[aria-selected="true"] {
      background: var(--option-selected-bg-color, #eff6ff);
      color: var(--option-selected-text-color, #1d4ed8);
    }

    .locale-flag {
      font-size: 1rem;
    }

    .locale-name {
      flex: 1;
    }

    .chevron {
      transition: transform 0.2s ease;
    }

    .chevron[data-expanded="true"] {
      transform: rotate(180deg);
    }

    /* Size variants */
    .size-sm .language-button {
      padding: 0.375rem 0.5rem;
      font-size: 0.75rem;
    }

    .size-lg .language-button {
      padding: 0.75rem 1rem;
      font-size: 1rem;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .language-button {
        --border-color: #374151;
        --bg-color: #1f2937;
        --text-color: #f9fafb;
        --hover-bg-color: #374151;
        --hover-border-color: #4b5563;
        --active-bg-color: #4b5563;
        --active-border-color: #6b7280;
        --focus-color: #60a5fa;
      }

      .dropdown {
        --dropdown-bg-color: #1f2937;
        --dropdown-border-color: #374151;
      }

      .locale-option {
        --option-text-color: #f9fafb;
        --option-hover-bg-color: #374151;
        --option-selected-bg-color: #1e40af;
        --option-selected-text-color: #93c5fd;
      }
    }
  </style>
</svelte:head>

<div class="language-switcher size-{size}" on:keydown={handleKeydown}>
  <button
    bind:this={buttonElement}
    use:buttonProps
    class="language-button"
    on:click={toggleDropdown}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-controls="language-dropdown"
  >
    <Globe size={size === 'sm' ? 16 : size === 'lg' ? 20 : 18} />
    {#if showLabel}
      <span class="locale-name">
        {localeNames[$currentLocale]}
      </span>
    {/if}
    <ChevronDown
      size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
      class="chevron"
      data-expanded={isOpen}
    />
  </button>

  <div
    bind:this={dropdownElement}
    id="language-dropdown"
    class="dropdown"
    data-visible={isOpen}
    role="listbox"
    aria-label="Select language"
  >
    {#each SUPPORTED_LOCALES as locale}
      <button
        class="locale-option"
        role="option"
        aria-selected={locale === $currentLocale}
        on:click={() => selectLocale(locale)}
        on:keydown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            selectLocale(locale);
          }
        }}
      >
        <span class="locale-flag" aria-hidden="true">
          {localeFlags[locale]}
        </span>
        <span class="locale-name">
          {localeNames[locale]}
        </span>
      </button>
    {/each}
  </div>
</div>