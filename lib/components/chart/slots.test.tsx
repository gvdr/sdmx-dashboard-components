// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import Chart from './index';
import type { SDMXChartConfig } from '../types';
import { SDMXRenderError } from '../../errors';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

const config = (): SDMXChartConfig => ({
    id: 'slot-chart',
    type: 'line',
    xAxisConcept: 'TIME_PERIOD',
    data: 'https://example.org/rest/data/X,Y,1.0/all'
});

// 2.0 response with zero observations: the parser raises its
// empty-observations error, classified as ERR_EMPTY
const emptyResponse = () => ({
    data: {
        structures: [
            {
                name: 'Test flow',
                names: { en: 'Test flow' },
                dimensions: {
                    dataSet: [],
                    series: [],
                    observation: [
                        { id: 'TIME_PERIOD', name: 'Time', keyPosition: 0, values: [] }
                    ]
                },
                attributes: { dataSet: [], dimensionGroup: [], series: [], observation: [] }
            }
        ],
        dataSets: [{ action: 'Information', observations: {} }]
    }
});

describe('render slots', () => {
    it('renderLoading replaces the built-in loading state', () => {
        vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* keep pending */ })));
        render(
            <Chart
                config={config()}
                language="en"
                renderLoading={(visualId) => <div data-testid="custom-loading">{`spinner for ${visualId}`}</div>}
            />
        );
        expect(screen.getByTestId('custom-loading').textContent).toBe('spinner for slot-chart');
        expect(screen.queryByText('Loading...')).toBeNull();
    });

    it('renderError replaces the built-in alert and receives the typed error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed');
        }));
        let received: SDMXRenderError | undefined;
        render(
            <Chart
                config={config()}
                language="en"
                renderError={(error) => {
                    received = error;
                    return <div data-testid="custom-error">{error.code}</div>;
                }}
            />
        );
        const custom = await screen.findByTestId('custom-error');
        expect(custom.textContent).toBe('ERR_FETCH');
        expect(received?.visualId).toBe('slot-chart');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('renderEmpty takes precedence over renderError for empty results', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            status: 200,
            text: async () => JSON.stringify(emptyResponse())
        })));
        render(
            <Chart
                config={config()}
                language="en"
                renderEmpty={(visualId) => <div data-testid="custom-empty">{`no data for ${visualId}`}</div>}
                renderError={(error) => <div data-testid="custom-error">{error.code}</div>}
            />
        );
        const custom = await screen.findByTestId('custom-empty');
        expect(custom.textContent).toBe('no data for slot-chart');
        expect(screen.queryByTestId('custom-error')).toBeNull();
    });

    it('defaults reproduce the current behaviour when no slot is given', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed');
        }));
        render(<Chart config={config()} language="en" />);
        const alert = await screen.findByRole('alert');
        expect(alert.getAttribute('data-error-code')).toBe('ERR_FETCH');
    });
});
