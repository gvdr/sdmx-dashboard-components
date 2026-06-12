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

const config = (): SDMXChartConfig => ({
    id: 'resize-chart',
    type: 'line',
    xAxisConcept: 'TIME_PERIOD',
    legend: { concept: 'GEO_PICT' },
    data: 'https://example.org/rest/data/X,Y,1.0/all'
});

// jsdom has no ResizeObserver; the stub counts instances. The charting
// engine creates its own observer, so the assertions compare instance
// counts between autoResize on and off instead of expecting absolutes.
class ResizeObserverStub {
    static instances: ResizeObserverStub[] = [];
    constructor(public callback: ResizeObserverCallback) {
        ResizeObserverStub.instances.push(this);
    }
    observe() { /* counted via instances */ }
    unobserve() { /* not needed */ }
    disconnect() { /* not needed */ }
}

const renderAndCountObservers = async (autoResize: boolean) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
        status: 200,
        text: async () => JSON.stringify(lineResponse())
    })));
    ResizeObserverStub.instances = [];
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);

    let chartInstance: any;
    render(<Chart config={config()} language="en" autoResize={autoResize} callback={(c: any) => { chartInstance = c; }} />);
    await waitFor(() => {
        expect(chartInstance).toBeDefined();
    });
    // let the post-mount observation effect run
    await waitFor(() => {
        expect(ResizeObserverStub.instances.length).toBeGreaterThan(0);
    });
    const count = ResizeObserverStub.instances.length;
    cleanup();
    vi.unstubAllGlobals();
    return count;
};

describe('container resize handling', () => {
    it('adds its own container observer, removable via autoResize={false}', async () => {
        const withResize = await renderAndCountObservers(true);
        const withoutResize = await renderAndCountObservers(false);
        expect(withResize).toBe(withoutResize + 1);
    });
});
