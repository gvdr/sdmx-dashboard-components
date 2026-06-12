// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import Chart from './chart';
import Dashboard from './dashboard';
import type { SDMXChartConfig, SDMXDashboardConfig, VisualRenderStatus } from './types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// SDMX-JSON 2.0 response with TIME_PERIOD varying (2 values) and one country:
// renders as a single-series line chart
const lineResponse = () => ({
    data: {
        structures: [
            {
                name: 'Test flow',
                names: { en: 'Test flow' },
                dimensions: {
                    dataSet: [],
                    series: [],
                    observation: [
                        { id: 'FREQ', name: 'Frequency', keyPosition: 0, values: [{ id: 'A', name: 'Annual' }] },
                        { id: 'TIME_PERIOD', name: 'Time', keyPosition: 1, values: [{ id: '2020', name: '2020' }, { id: '2021', name: '2021' }] },
                        { id: 'GEO_PICT', name: 'Country', keyPosition: 2, values: [{ id: 'FJ', name: 'Fiji' }] }
                    ]
                },
                attributes: { dataSet: [], dimensionGroup: [], series: [], observation: [] }
            }
        ],
        dataSets: [{ action: 'Information', observations: { '0:0:0': [100], '0:1:0': [110] } }]
    }
});

const stubFetchWith = (body: object) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        status: 200,
        text: async () => JSON.stringify(body)
    })));
};

describe('onVisualRender on a standalone chart', () => {
    it('reports loading then rendered with stats', async () => {
        stubFetchWith(lineResponse());
        const statuses: VisualRenderStatus[] = [];
        const config: SDMXChartConfig = {
            id: 'line-1',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };

        render(<Chart config={config} language="en" onVisualRender={(s) => statuses.push(s)} />);

        await waitFor(() => {
            expect(statuses.map((s) => s.status)).toContain('rendered');
        });
        expect(statuses[0]).toEqual({ visualId: 'line-1', status: 'loading' });
        const rendered = statuses.find((s) => s.status === 'rendered')!;
        expect(rendered.stats).toEqual({
            observationCount: 2,
            seriesCount: 1,
            timePeriodRange: ['2020', '2021']
        });
    });

    it('reports error with the typed error attached', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed');
        }));
        const statuses: VisualRenderStatus[] = [];
        const config: SDMXChartConfig = {
            id: 'line-2',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };

        render(<Chart config={config} language="en" onVisualRender={(s) => statuses.push(s)} />);

        await waitFor(() => {
            expect(statuses.map((s) => s.status)).toContain('error');
        });
        const errored = statuses.find((s) => s.status === 'error')!;
        expect(errored.error?.code).toBe('ERR_FETCH');
        expect(errored.error?.visualId).toBe('line-2');
    });
});

describe('onRenderComplete on the dashboard', () => {
    it('fires exactly once when every visual settles, including the all-error case', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed');
        }));
        const completions: VisualRenderStatus[][] = [];
        const config: SDMXDashboardConfig = {
            id: 'dash-1',
            rows: [
                {
                    columns: [
                        { id: 'vis-a', type: 'line', xAxisConcept: 'TIME_PERIOD', data: 'https://example.org/rest/data/A,A,1.0/all' },
                        { id: 'vis-b', type: 'line', xAxisConcept: 'TIME_PERIOD', data: 'https://example.org/rest/data/B,B,1.0/all' }
                    ]
                }
            ]
        } as unknown as SDMXDashboardConfig;

        render(<Dashboard config={config} lang="en" onRenderComplete={(all) => completions.push(all)} />);

        await waitFor(() => {
            expect(completions.length).toBe(1);
        });
        // both visuals are present, both settled in error
        expect(completions[0].map((s) => s.visualId).sort()).toEqual(['vis-a', 'vis-b']);
        expect(completions[0].every((s) => s.status === 'error')).toBe(true);

        // settle any stragglers and confirm no second firing
        await screen.findAllByRole('alert');
        expect(completions.length).toBe(1);
    });
});
