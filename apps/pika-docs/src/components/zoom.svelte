<script>
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { quintOut, cubicOut } from 'svelte/easing';
  
  export let label = '';
  
  let containerRef;
  let dialogRef;
  let isOpen = false;
  let imgElement = null;
  let zoomedImgSrc = '';
  let zoomedImgAlt = '';
  let isAnimating = false;
  
  onMount(() => {
    // Find the image element inside the slot
    if (containerRef) {
      imgElement = containerRef.querySelector('img');
      if (imgElement) {
        zoomedImgSrc = imgElement.src;
        zoomedImgAlt = imgElement.alt || label;
        console.log('[Zoom] Image found on mount:', { src: zoomedImgSrc, alt: zoomedImgAlt });
      } else {
        console.warn('[Zoom] No image element found in container');
      }
    }
  });
  
  function openZoom(event) {
    console.log('[Zoom] Click detected', { imgElement, isAnimating, containerRef });
    
    // Re-find the image if it wasn't found on mount
    if (!imgElement && containerRef) {
      imgElement = containerRef.querySelector('img');
      if (imgElement) {
        zoomedImgSrc = imgElement.src;
        zoomedImgAlt = imgElement.alt || label;
      }
    }
    
    if (!imgElement) {
      console.error('[Zoom] No image element available to zoom');
      return;
    }
    
    if (isAnimating) {
      console.log('[Zoom] Already animating, skipping');
      return;
    }
    
    zoomedImgSrc = imgElement.src;
    zoomedImgAlt = imgElement.alt || label;
    isAnimating = true;
    isOpen = true;
    
    console.log('[Zoom] Opening dialog with:', { src: zoomedImgSrc, alt: zoomedImgAlt });
    
    // Open the dialog
    if (dialogRef) {
      dialogRef.showModal();
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    } else {
      console.error('[Zoom] Dialog ref not available');
    }
    
    // Reset animation lock after animation completes
    setTimeout(() => {
      isAnimating = false;
    }, 400);
  }
  
  function closeZoom() {
    if (isAnimating) return;
    
    isAnimating = true;
    
    // Add closing class for animation
    if (dialogRef) {
      dialogRef.classList.add('closing');
    }
    
    // Wait for animation to complete before actually closing
    setTimeout(() => {
      isOpen = false;
      if (dialogRef) {
        dialogRef.close();
        dialogRef.classList.remove('closing');
        // Restore body scroll
        document.body.style.overflow = '';
      }
      isAnimating = false;
    }, 300);
  }
  
  function handleDialogClick(event) {
    // Close when clicking anywhere in the dialog
    closeZoom();
  }
  
  function handleKeydown(event) {
    if (event.key === 'Escape' && isOpen) {
      closeZoom();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="zoom-wrapper" bind:this={containerRef}>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="zoomable" on:click={openZoom}>
    <slot />
  </div>
</div>

<dialog 
  bind:this={dialogRef}
  class="zoom-dialog"
  on:click={handleDialogClick}
>
  {#if isOpen}
    <div class="zoom-content" transition:fade={{ duration: 300, easing: cubicOut }}>
      <figure 
        in:scale={{ duration: 400, start: 0.85, easing: quintOut }}
        out:scale={{ duration: 300, start: 1, easing: cubicOut }}
      >
        <img src={zoomedImgSrc} alt={zoomedImgAlt} class="zoomed-image" />
        {#if zoomedImgAlt}
          <figcaption 
            in:fade={{ duration: 300, delay: 200 }}
            out:fade={{ duration: 200 }}
          >
            {zoomedImgAlt}
          </figcaption>
        {/if}
      </figure>
    </div>
  {/if}
</dialog>

<style>
  .zoom-wrapper {
    display: inline-block;
    max-width: 100%;
  }
  
  .zoomable {
    position: relative;
    display: inline-block;
    width: 100%;
  }
  
  .zoomable :global(img) {
    cursor: zoom-in;
    display: block;
    max-width: 100%;
    height: auto;
  }
  
  
  .zoom-dialog {
    background: transparent;
    border: 0;
    height: 100vh;
    height: 100dvh;
    margin: 0;
    max-height: none;
    max-width: none;
    overflow: hidden;
    padding: 0;
    position: fixed;
    width: 100vw;
    width: 100dvw;
  }
  
  .zoom-dialog::backdrop {
    background: var(--sl-color-black, rgba(0, 0, 0, 0.95));
    opacity: 0;
    animation: fadeIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  
  .zoom-dialog:global(.closing)::backdrop {
    animation: fadeOut 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
  
  @keyframes fadeIn {
    to {
      opacity: 1;
    }
  }
  
  @keyframes fadeOut {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
  
  .zoom-content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    cursor: zoom-out;
  }
  
  
  figure {
    width: 95vw;
    height: 95vh;
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    cursor: zoom-out;
    position: relative;
  }
  
  .zoomed-image {
    /* Fill the available space while maintaining aspect ratio */
    max-width: 100%;
    max-height: calc(100% - 60px); /* Leave room for caption */
    min-width: 60vw; /* Ensure small images scale up */
    min-height: 60vh;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    border-radius: 8px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  }
  
  figcaption {
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--sl-color-bg-nav, rgba(255, 255, 255, 0.95));
    color: var(--sl-color-text, #1a1a1a);
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    border: 1px solid var(--sl-color-gray-2, #e5e7eb);
    max-width: 90%;
    text-align: center;
    font-size: 0.9rem;
    pointer-events: none;
  }
  
  @media (prefers-color-scheme: dark) {
    figcaption {
      background-color: var(--sl-color-bg-nav, rgba(23, 23, 23, 0.95));
      border-color: var(--sl-color-gray-5, #374151);
      color: var(--sl-color-text, #e5e7eb);
    }
  }
  
  @media (prefers-reduced-motion: reduce) {
    .zoom-dialog::backdrop,
    .zoomed-image {
      animation: none;
    }
  }
</style>

