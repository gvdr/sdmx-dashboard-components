// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import Dashboard from './dashboard';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// note cells need no data, so the dashboard renders without any fetch
describe('rows[].colums deprecated alias', () => {
    it('renders cells declared under the misspelled `colums` key', async () => {
        const config = {
            id: 'dash-alias',
            rows: [
                { colums: [{ id: 'note-1', type: 'note', note: { text: 'Hello from colums' } }] }
            ]
        } as any;

        render(<Dashboard config={config} lang="en" />);

        await waitFor(() => {
            expect(screen.getByText('Hello from colums')).toBeTruthy();
        });
    });

    it('renders cells declared under the correct `columns` key', async () => {
        const config = {
            id: 'dash-correct',
            rows: [
                { columns: [{ id: 'note-2', type: 'note', note: { text: 'Hello from columns' } }] }
            ]
        } as any;

        render(<Dashboard config={config} lang="en" />);

        await waitFor(() => {
            expect(screen.getByText('Hello from columns')).toBeTruthy();
        });
    });
});
