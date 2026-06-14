// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, waitFor, cleanup } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

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

describe('semantic axis titles', () => {
    it('applies xAxisTitle and yAxisTitle to the chart options without clobbering the category axis', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(lineResponse())
        })));

        const config: SDMXChartConfig = {
            id: 'titled',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            xAxisTitle: { text: 'Reporting year' },
            yAxisTitle: { text: { en: 'Population', fr: 'Population' } },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };

        let chartInstance: any;
        render(<Chart config={config} language="en" callback={(c: any) => { chartInstance = c; }} />);

        await waitFor(() => {
            expect(chartInstance?.options?.xAxis?.[0]?.title?.text).toBe('Reporting year');
        });
        expect(chartInstance.options.yAxis[0].title.text).toBe('Population');
        // the datetime axis configured by the line branch is preserved
        expect(chartInstance.options.xAxis[0].type).toBe('datetime');
    });

    it('leaves engine default titles when not configured', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(lineResponse())
        })));
        const config: SDMXChartConfig = {
            id: 'untitled',
            type: 'line',
            xAxisConcept: 'TIME_PERIOD',
            legend: { concept: 'GEO_PICT' },
            data: 'https://example.org/rest/data/X,Y,1.0/all'
        };
        let chartInstance: any;
        render(<Chart config={config} language="en" callback={(c: any) => { chartInstance = c; }} />);
        await waitFor(() => {
            expect(chartInstance?.series?.length).toBe(1);
        });
        // we did not set an x-axis title; Highcharts leaves its own default
        expect(chartInstance.options.xAxis[0].title?.text ?? null).not.toBe('Reporting year');
    });
});
