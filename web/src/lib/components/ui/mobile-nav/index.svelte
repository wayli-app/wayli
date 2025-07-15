<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { Menu, X, ChevronDown } from 'lucide-svelte';
  import { FocusManager, ariaHelpers, keyboardNavigation } from '$lib/accessibility/accessibility-utils';

  export let items: Array<{
    label: string;
    href?: string;
    icon?: any;
    children?: Array<{ label: string; href: string; icon?: any }>;
    action?: () => void;
  }> = [];
  export let className: string = '';

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let activeDropdown: number | null = null;
  let navElement: HTMLElement;
  let focusManager: FocusManager;

  onMount(() => {
    if (navElement) {
      focusManager = new FocusManager(navElement);
    }
  });

  function toggleMenu() {
    isOpen = !isOpen;
    if (isOpen) {
      // Focus first menu item when opening
      setTimeout(() => {
        focusManager?.focusFirst();
      }, 100);
    }
    dispatch('toggle', { isOpen });
  }

  function closeMenu() {
    isOpen = false;
    activeDropdown = null;
    dispatch('close');
  }

  function toggleDropdown(index: number) {
    activeDropdown = activeDropdown === index ? null : index;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    keyboardNavigation.handleEscape(event, closeMenu);

    if (event.key === 'Tab' && !event.shiftKey) {
      // Allow normal tab navigation within menu
      return;
    }
  }

  function handleItemClick(item: any) {
    if (item.action) {
      item.action();
    }
    closeMenu();
  }
</script>

<nav bind:this={navElement} class={className}>
  <!-- Mobile Menu Button -->
  <button
    class="md:hidden p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]"
    on:click={toggleMenu}
    aria-expanded={isOpen}
    aria-controls="mobile-menu"
    aria-label="Toggle navigation menu"
  >
    {#if isOpen}
      <X class="h-6 w-6" />
    {:else}
      <Menu class="h-6 w-6" />
    {/if}
  </button>

  <!-- Mobile Menu Overlay -->
  {#if isOpen}
    <div
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm md:hidden"
      on:click={closeMenu}
      role="presentation"
      aria-hidden="true"
    />
  {/if}

  <!-- Mobile Menu Content -->
  {#if isOpen}
    <div
      id="mobile-menu"
      class="fixed inset-y-0 right-0 z-50 w-80 bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-300 ease-in-out md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mobile-menu-title"
    >
      <div class="flex flex-col h-full">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 id="mobile-menu-title" class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Navigation
          </h2>
          <button
            class="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 min-h-[44px] min-w-[44px]"
            on:click={closeMenu}
            aria-label="Close navigation menu"
          >
            <X class="h-6 w-6" />
          </button>
        </div>

        <!-- Menu Items -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          {#each items as item, index}
            <div class="space-y-1">
              {#if item.href}
                <a
                  href={item.href}
                  class="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors min-h-[44px]"
                  on:click={closeMenu}
                >
                  {#if item.icon}
                    <svelte:component this={item.icon} class="h-5 w-5 mr-3" />
                  {/if}
                  {item.label}
                </a>
              {:else if item.children}
                <button
                  class="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors min-h-[44px]"
                  on:click={() => toggleDropdown(index)}
                  aria-expanded={activeDropdown === index}
                  aria-controls="dropdown-{index}"
                >
                  <div class="flex items-center">
                    {#if item.icon}
                      <svelte:component this={item.icon} class="h-5 w-5 mr-3" />
                    {/if}
                    {item.label}
                  </div>
                  <ChevronDown class="h-4 w-4 transition-transform {activeDropdown === index ? 'rotate-180' : ''}" />
                </button>
                {#if activeDropdown === index}
                  <div id="dropdown-{index}" class="ml-4 space-y-1">
                    {#each item.children as child}
                      <a
                        href={child.href}
                        class="flex items-center w-full px-4 py-2 text-sm text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors min-h-[44px]"
                        on:click={closeMenu}
                      >
                        {#if child.icon}
                          <svelte:component this={child.icon} class="h-4 w-4 mr-3" />
                        {/if}
                        {child.label}
                      </a>
                    {/each}
                  </div>
                {/if}
              {:else if item.action}
                <button
                  class="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 transition-colors min-h-[44px]"
                  on:click={() => handleItemClick(item)}
                >
                  {#if item.icon}
                    <svelte:component this={item.icon} class="h-5 w-5 mr-3" />
                  {/if}
                  {item.label}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</nav>

<svelte:window on:keydown={handleKeydown} />