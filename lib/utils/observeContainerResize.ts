/**
 * Watch an element for size changes and invoke the callback once per burst
 * of changes, debounced. Covers container resizes that happen without a
 * window resize event (sidebars opening, preview panes dragging, CSS
 * transitions). Returns a cleanup function; in environments without
 * ResizeObserver the call is a no-op.
 */
export const observeContainerResize = (
    target: Element,
    onResize: () => void,
    debounceMs: number = 150
): (() => void) => {
    if (typeof ResizeObserver === 'undefined') {
        return () => { /* nothing to clean up */ };
    }
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(onResize, debounceMs);
    });
    observer.observe(target);
    return () => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        observer.disconnect();
    };
}
