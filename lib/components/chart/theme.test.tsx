// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig, SDMXTheme } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

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
        dataSets: [{ action: 'Information', observations: { '0:0:0': [100], '0:1:0': [110], '0:0:1': [50], '0:1:1': [52] } }]
    }
});

const stub = () => vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, text: async () => JSON.stringify(multiSeriesResponse()) })));

describe('theme', () => {
    it('applies the theme palette and fonts to the chart options', async () => {
        stub();
        const theme: SDMXTheme = {
            palette: ['#aa0000', '#00aa00'],
            fontFamily: { display: 'Georgia', data: 'Inter' }
        };
        const config: SDMXChartConfig = {
            id: 'themed',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };
        let chartInstance: any;
        render(<Chart config={config} language="en" theme={theme} callback={(c: any) => { chartInstance = c; }} />);
        await waitFor(() => {
            expect(chartInstance?.options?.colors).toEqual(['#aa0000', '#00aa00']);
        });
        expect(chartInstance.options.chart.style.fontFamily).toBe('Inter');
    });

    it('lets a per-visual colorPalette override the theme palette', async () => {
        stub();
        const theme: SDMXTheme = { palette: ['#aa0000', '#00aa00'] };
        const config: SDMXChartConfig = {
            id: 'themed-override',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            colorPalette: { GEO_PICT: { FJ: '#123456', WS: '#654321' } },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };
        let chartInstance: any;
        render(<Chart config={config} language="en" theme={theme} callback={(c: any) => { chartInstance = c; }} />);
        await waitFor(() => {
            expect(chartInstance?.series?.length).toBe(2);
        });
        // explicit per-series colours from colorPalette win over theme.colors
        const seriesColors = chartInstance.series.map((s: any) => s.options.color);
        expect(seriesColors).toContain('#123456');
        expect(seriesColors).toContain('#654321');
    });
});
