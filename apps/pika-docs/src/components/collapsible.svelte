<script>
  export let title = '';
  export let expanded = false;
  
  let isOpen = expanded;
  
  function toggle() {
    isOpen = !isOpen;
  }
</script>

<div class="collapsible">
  <button 
    class="collapsible-header" 
    on:click={toggle}
    aria-expanded={isOpen}
  >
    <span class="caret" class:open={isOpen}>
      <!-- Right caret that rotates to point down when open -->
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path d="M12.14 8.753l-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z"/>
      </svg>
    </span>
    <span class="title">{title}</span>
  </button>
  
  {#if isOpen}
    <div class="collapsible-content">
      <slot />
    </div>
  {/if}
</div>

<style>
  .collapsible {
    margin: 1rem 0;
  }
  
  .collapsible-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-align: left;
    width: 100%;
    color: inherit;
  }
  
  .collapsible-header:hover {
    opacity: 0.8;
  }
  
  .caret {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transform: rotate(0deg);
    transition: transform 0.3s ease;
  }
  
  .caret.open {
    transform: rotate(90deg);
  }
  
  .caret svg {
    display: block;
  }
  
  .title {
    font-weight: 500;
    font-size: 1rem;
  }
  
  .collapsible-content {
    /* Indent to align with first letter of title */
    /* 16px (caret width) + 0.5rem (gap) = ~24px */
    margin-left: 24px;
    margin-top: 0.5rem;
    padding-top: 0.25rem;
  }
  
  /* Support for nested content */
  .collapsible-content :global(p:first-child) {
    margin-top: 0;
  }
  
  .collapsible-content :global(p:last-child) {
    margin-bottom: 0;
  }
</style>

