// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup, within } from '@testing-library/react';
import Table from './index';
import type { SDMXTableConfig } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// two countries over two years, AllDimensions observations
const response = () => ({
    data: {
        structures: [
            {
                name: 'Test flow',
                names: { en: 'Test flow' },
                dimensions: {
                    dataSet: [],
                    series: [],
                    observation: [
                        { id: 'TIME_PERIOD', name: 'Time', keyPosition: 0, values: [{ id: '2020', name: '2020' }, { id: '2021', name: '2021' }] },
                        { id: 'GEO_PICT', name: 'Country', keyPosition: 1, values: [{ id: 'FJ', name: 'Fiji' }, { id: 'WS', name: 'Samoa' }] }
                    ]
                },
                attributes: { dataSet: [], dimensionGroup: [], series: [], observation: [] }
            }
        ],
        dataSets: [{
            action: 'Information',
            observations: { '0:0': [100], '1:0': [110], '0:1': [50], '1:1': [52] }
        }]
    }
});

const config = (): SDMXTableConfig => ({
    id: 'table-1',
    type: 'table',
    xAxisConcept: 'TIME_PERIOD',
    legend: { concept: 'GEO_PICT' },
    data: 'https://example.org/rest/data/X,Y,1.0/all?dimensionAtObservation=AllDimensions'
});

describe('SDMXTable', () => {
    it('pivots the data into a table with the stratifier across columns', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(response())
        })));

        render(<Table config={config()} language="en" />);

        const table = await screen.findByRole('table');
        const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent);
        expect(headers).toEqual(['TIME_PERIOD', 'Fiji', 'Samoa']);

        // row 2021: Fiji 110, Samoa 52
        const rowHeader = within(table).getByText('2021');
        const row = rowHeader.closest('tr')!;
        const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
        expect(cells).toEqual(['110', '52']);
    });

    it('reports rendered lifecycle with stats', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(response())
        })));
        const statuses: any[] = [];
        render(<Table config={config()} language="en" onVisualRender={(s) => statuses.push(s)} />);

        await waitFor(() => {
            expect(statuses.map((s) => s.status)).toContain('rendered');
        });
        const rendered = statuses.find((s) => s.status === 'rendered');
        expect(rendered.stats.observationCount).toBe(4);
        expect(rendered.stats.seriesCount).toBe(2);
    });

    it('surfaces ERR_CONCEPT_NOT_FOUND for a wrong xAxisConcept', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(response())
        })));
        render(<Table config={{ ...config(), xAxisConcept: 'NOPE' }} language="en" />);
        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-error-code')).toBe('ERR_CONCEPT_NOT_FOUND');
    });
});
