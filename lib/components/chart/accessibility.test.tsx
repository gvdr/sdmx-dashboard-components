// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const multiSeriesResponse = () => ({
    data: {
        structures: [
            {
                name: 'Population by country',
                names: { en: 'Population by country' },
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

const config = (): SDMXChartConfig => ({
    id: 'a11y-chart',
    type: 'line',
    title: { text: 'Population by country' },
    xAxisConcept: 'TIME_PERIOD',
    legend: { concept: 'GEO_PICT' },
    data: 'https://example.org/rest/data/X,Y,1.0/all'
});

describe('chart accessibility', () => {
    it('renders a data-table fallback with every observation', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(multiSeriesResponse())
        })));

        render(<Chart config={config()} language="en" />);

        const table = await screen.findByRole('table');
        // caption names the chart
        expect(within(table).getByText('Population by country')).toBeTruthy();
        // columns are the stratifier values
        const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
        expect(headers).toEqual(['TIME_PERIOD', 'Fiji', 'Samoa']);
        // every observation is present
        const row2020 = within(table).getByText('2020').closest('tr')!;
        expect(within(row2020).getAllByRole('cell').map((c) => c.textContent)).toEqual(['100', '50']);
        const row2021 = within(table).getByText('2021').closest('tr')!;
        expect(within(row2021).getAllByRole('cell').map((c) => c.textContent)).toEqual(['110', '52']);
    });
});
