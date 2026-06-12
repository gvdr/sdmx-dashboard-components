import { describe, it, expect, vi, afterEach } from 'vitest';
import { observeContainerResize } from './observeContainerResize';

class ResizeObserverStub {
    static instances: ResizeObserverStub[] = [];
    callback: ResizeObserverCallback;
    observed: unknown[] = [];
    disconnected = false;
    constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        ResizeObserverStub.instances.push(this);
    }
    observe(target: unknown) {
        this.observed.push(target);
    }
    unobserve() { /* not needed */ }
    disconnect() {
        this.disconnected = true;
    }
    trigger() {
        this.callback([], this as unknown as ResizeObserver);
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    ResizeObserverStub.instances = [];
});

describe('observeContainerResize', () => {
    it('observes the target and collapses a burst of changes into one callback', () => {
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        const onResize = vi.fn();
        const target = {} as Element;

        observeContainerResize(target, onResize);
        const observer = ResizeObserverStub.instances[0];
        expect(observer.observed).toEqual([target]);

        observer.trigger();
        observer.trigger();
        observer.trigger();
        expect(onResize).not.toHaveBeenCalled();
        vi.advanceTimersByTime(150);
        expect(onResize).toHaveBeenCalledTimes(1);

        // a later change fires again
        observer.trigger();
        vi.advanceTimersByTime(150);
        expect(onResize).toHaveBeenCalledTimes(2);
    });

    it('cleanup disconnects the observer and cancels a pending callback', () => {
        vi.useFakeTimers();
        vi.stubGlobal('ResizeObserver', ResizeObserverStub);
        const onResize = vi.fn();

        const cleanup = observeContainerResize({} as Element, onResize);
        const observer = ResizeObserverStub.instances[0];
        observer.trigger();
        cleanup();
        vi.advanceTimersByTime(300);
        expect(onResize).not.toHaveBeenCalled();
        expect(observer.disconnected).toBe(true);
    });

    it('is a no-op without ResizeObserver support', () => {
        const original = (globalThis as any).ResizeObserver;
        delete (globalThis as any).ResizeObserver;
        try {
            const cleanup = observeContainerResize({} as Element, vi.fn());
            expect(() => cleanup()).not.toThrow();
        } finally {
            if (original) {
                (globalThis as any).ResizeObserver = original;
            }
        }
    });
});
