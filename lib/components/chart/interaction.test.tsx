// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig, VisualInteraction } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// two countries over two years: a multi-series line chart
const multiSeriesResponse = () => ({
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
                        { id: 'GEO_PICT', name: 'Country', keyPosition: 2, values: [{ id: 'FJ', name: 'Fiji' }, { id: 'WS', name: 'Samoa' }] }
                    ]
                },
                attributes: { dataSet: [], dimensionGroup: [], series: [], observation: [] }
            }
        ],
        dataSets: [{
            action: 'Information',
            observations: { '0:0:0': [100], '0:1:0': [110], '0:0:1': [50], '0:1:1': [52] }
        }]
    }
});

describe('onUserInteraction', () => {
    it('clicking a point on a multi-series line chart yields the full dimension coordinate', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(multiSeriesResponse())
        })));
        const interactions: VisualInteraction[] = [];
        const config: SDMXChartConfig = {
            id: 'multi-line',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };

        let chartInstance: any;
        render(
            <Chart
                config={config}
                language="en"
                callback={(c: any) => { chartInstance = c; }}
                onUserInteraction={(e) => interactions.push(e)}
            />
        );

        await waitFor(() => {
            expect(chartInstance?.series?.length).toBe(2);
        });

        const samoaSeries = chartInstance.series.find((s: any) => s.name === 'Samoa');
        const point2021 = samoaSeries.points.find((p: any) => p.options.TIME_PERIOD === '2021');
        point2021.firePointEvent('click');

        expect(interactions).toHaveLength(1);
        expect(interactions[0]).toEqual({
            visualId: 'multi-line',
            kind: 'point-click',
            concepts: {
                FREQ: 'A',
                TIME_PERIOD: '2021',
                GEO_PICT: 'WS'
            },
            value: 52,
            timePeriod: '2021'
        });
    });

    it('adds no behaviour when the callback is absent', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(multiSeriesResponse())
        })));
        let chartInstance: any;
        render(<Chart config={{
            id: 'multi-line-2',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        }} language="en" callback={(c: any) => { chartInstance = c; }} />);

        await waitFor(() => {
            expect(chartInstance?.series?.length).toBe(2);
        });
        expect(() => chartInstance.series[0].points[0].firePointEvent('click')).not.toThrow();
    });
});
