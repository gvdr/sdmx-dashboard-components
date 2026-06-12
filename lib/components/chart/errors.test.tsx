// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig } from '../types';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// SDMX-JSON 2.0 response where only TIME_PERIOD varies: two annual
// observations for one country
const singleSeriesResponse = () => ({
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
                        { id: 'GEO_PICT', name: 'Country', keyPosition: 1, values: [{ id: 'FJ', name: 'Fiji' }] }
                    ]
                },
                attributes: { dataSet: [], dimensionGroup: [], series: [], observation: [] }
            }
        ],
        dataSets: [{ action: 'Information', observations: { '0:0': [100], '1:0': [110] } }]
    }
});

const barConfig = (): SDMXChartConfig => ({
    id: 'test-bar',
    type: 'bar',
    xAxisConcept: 'TIME_PERIOD',
    data: 'https://example.org/rest/data/X,Y,1.0/all?dimensionAtObservation=AllDimensions'
});

describe('chart error surfacing', () => {
    it('renders ERR_NO_SERIES_DIMENSION in the panel for a bar chart over a single-series query', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(singleSeriesResponse())
        })));

        render(<Chart config={barConfig()} language="en" />);

        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-error-code')).toBe('ERR_NO_SERIES_DIMENSION');
        expect(alert.textContent).toContain('needs at least one other varying dimension');
        expect(alert.textContent).toContain('Only TIME_PERIOD varies in this query');
    });

    it('renders ERR_FETCH when the data URL is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed');
        }));

        render(<Chart config={barConfig()} language="en" />);

        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-error-code')).toBe('ERR_FETCH');
    });

    it('renders ERR_CONCEPT_NOT_FOUND naming the available concepts for a wrong xAxisConcept', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(singleSeriesResponse())
        })));

        render(<Chart config={{ ...barConfig(), xAxisConcept: 'REF_AREA' }} language="en" />);

        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-error-code')).toBe('ERR_CONCEPT_NOT_FOUND');
        expect(alert.textContent).toContain('REF_AREA not found');
        expect(alert.textContent).toContain('TIME_PERIOD');
        expect(alert.textContent).toContain('GEO_PICT');
    });
});
