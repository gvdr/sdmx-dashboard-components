import { SDMXFetcher } from '../components/types';

// fired once per settled request, including deduplicated cache hits
export type FetchTelemetry = {
    url: string,
    host: string,
    status: number | "network-error",
    durationMs: number,
    fromCache: boolean,
    retried: boolean
}

type SettledExchange = {
    status: number,
    statusText: string,
    contentType: string | null,
    body: string,
    retried: boolean
}

const IS_SDMX_TRANSPORT = Symbol.for('sdmx-dashboard-components.transport');
const RETRY_BACKOFF_MS = 300;

const hostOf = (url: string): string => {
    try {
        return new URL(url).host;
    } catch {
        return '';
    }
}

/**
 * Wrap a fetcher with the behaviours SDMX endpoint instability calls for:
 *
 *  - identical in-flight URLs share one network request, and settled
 *    responses are cached for the lifetime of the transport (the dashboard
 *    creates one transport per rendered config, so a config change
 *    invalidates);
 *  - network errors and 5xx responses are retried once after a short
 *    backoff; 4xx responses fail immediately;
 *  - every settled request is reported through onDataFetch, cache hits
 *    with fromCache true and no double counting of the network exchange.
 *
 * Passing an existing transport returns it unchanged, so component-level
 * wrapping does not stack on a dashboard-level transport.
 */
export const createTransport = (
    baseFetcher?: SDMXFetcher,
    onDataFetch?: (telemetry: FetchTelemetry) => void
): SDMXFetcher => {
    if (baseFetcher && (baseFetcher as any)[IS_SDMX_TRANSPORT]) {
        return baseFetcher;
    }
    const exchanges = new Map<string, Promise<SettledExchange>>();

    const runExchange = async (url: string, init?: RequestInit): Promise<SettledExchange> => {
        const doFetch: SDMXFetcher = baseFetcher || fetch;
        let retried = false;
        let response: Response;
        try {
            response = await doFetch(url, init);
        } catch (firstError) {
            retried = true;
            await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
            response = await doFetch(url, init);
        }
        if (response.status >= 500 && !retried) {
            retried = true;
            await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
            response = await doFetch(url, init);
        }
        const body = await response.text();
        return {
            status: response.status,
            statusText: response.statusText,
            contentType: response.headers?.get?.('content-type') ?? null,
            body,
            retried
        };
    }

    const transport: SDMXFetcher = async (url, init) => {
        const startedAt = Date.now();
        const inFlight = exchanges.get(url);
        const fromCache = inFlight !== undefined;
        const exchange = inFlight ?? runExchange(url, init);
        if (!fromCache) {
            exchanges.set(url, exchange);
        }
        let settled: SettledExchange;
        try {
            settled = await exchange;
        } catch (error) {
            // failures are not cached: a later caller gets a fresh attempt
            exchanges.delete(url);
            onDataFetch?.({
                url,
                host: hostOf(url),
                status: 'network-error',
                durationMs: Date.now() - startedAt,
                fromCache,
                retried: !fromCache
            });
            throw error;
        }
        onDataFetch?.({
            url,
            host: hostOf(url),
            status: settled.status,
            durationMs: Date.now() - startedAt,
            fromCache,
            retried: fromCache ? false : settled.retried
        });
        return new Response(settled.body, {
            status: settled.status,
            statusText: settled.statusText,
            headers: settled.contentType ? { 'content-type': settled.contentType } : undefined
        });
    }
    (transport as any)[IS_SDMX_TRANSPORT] = true;
    return transport;
}
