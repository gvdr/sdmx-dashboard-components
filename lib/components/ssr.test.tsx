// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// In the node environment there is no DOM. A module that touched window or
// document at import time, or a component that did so during the server
// render, would throw here. The parser is mocked so the test isolates the
// library's own SSR-safety from the peer dependency's packaging.
vi.mock('sdmx-json-parser', () => {
    class SDMXParser {
        async getDatasets() { return {}; }
        getData() { return []; }
        getDimensions() { return []; }
        getActiveDimensions() { return []; }
        getAttributes() { return []; }
    }
    return { SDMXParser };
});

describe('SSR safety', () => {
    it('imports the package entry with no DOM present', async () => {
        expect(typeof document).toBe('undefined');
        const mod = await import('./../index');
        expect(typeof mod.SDMXChart).toBe('function');
        expect(typeof mod.SDMXValue).toBe('function');
        expect(typeof mod.SDMXMap).toBe('function');
        expect(typeof mod.SDMXDashboard).toBe('function');
    }, 20000);

    it('server-renders a chart to a placeholder without touching the DOM', async () => {
        const React = (await import('react')).default;
        const { renderToStaticMarkup } = await import('react-dom/server');
        const SDMXChart = (await import('./chart')).default;

        const markup = renderToStaticMarkup(
            React.createElement(SDMXChart, {
                config: {
                    id: 'ssr-chart',
                    type: 'line',
                    xAxisConcept: 'TIME_PERIOD',
                    data: 'https://example.org/rest/data/X,Y,1.0/all'
                },
                language: 'en'
            })
        );
        // the server render produces the loading placeholder; the chart and
        // its data fetch only happen client-side inside useEffect
        expect(markup).toContain('Loading...');
    });

    it('server-renders the dashboard without a lang prop and no DOM', async () => {
        const React = (await import('react')).default;
        const { renderToStaticMarkup } = await import('react-dom/server');
        const SDMXDashboard = (await import('./dashboard')).default;

        const markup = renderToStaticMarkup(
            React.createElement(SDMXDashboard, {
                config: { id: 'ssr-dash', rows: [] } as any
            })
        );
        expect(typeof markup).toBe('string');
    });
});
