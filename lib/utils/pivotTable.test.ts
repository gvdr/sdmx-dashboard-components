import { describe, it, expect } from 'vitest';
import { pivotTable, SINGLE_VALUE_COLUMN } from './pivotTable';

const dimensions = [
    { id: 'TIME_PERIOD', values: [{ id: '2020', name: '2020' }, { id: '2021', name: '2021' }] },
    { id: 'GEO_PICT', values: [{ id: 'FJ', name: 'Fiji' }, { id: 'WS', name: 'Samoa' }] }
];

const data = [
    { TIME_PERIOD: '2020', GEO_PICT: 'Fiji', value: 100 },
    { TIME_PERIOD: '2021', GEO_PICT: 'Fiji', value: 110 },
    { TIME_PERIOD: '2020', GEO_PICT: 'Samoa', value: 50 },
    { TIME_PERIOD: '2021', GEO_PICT: 'Samoa', value: 52 }
];

describe('pivotTable', () => {
    it('pivots rows by x-axis and columns by legend concept in dimension order', () => {
        const table = pivotTable(data, 'TIME_PERIOD', 'GEO_PICT', dimensions);
        expect(table.rowKeys).toEqual(['2020', '2021']);
        expect(table.columnKeys).toEqual(['Fiji', 'Samoa']);
        expect(table.cells['2020']['Fiji']).toBe(100);
        expect(table.cells['2021']['Samoa']).toBe(52);
    });

    it('uses a single value column when no legend concept is set', () => {
        const oneSeries = data.filter((row) => row.GEO_PICT === 'Fiji');
        const table = pivotTable(oneSeries, 'TIME_PERIOD', undefined, dimensions);
        expect(table.columnKeys).toEqual([SINGLE_VALUE_COLUMN]);
        expect(table.cells['2020'][SINGLE_VALUE_COLUMN]).toBe(100);
        expect(table.cells['2021'][SINGLE_VALUE_COLUMN]).toBe(110);
    });

    it('leaves missing combinations undefined', () => {
        const sparse = [
            { TIME_PERIOD: '2020', GEO_PICT: 'Fiji', value: 100 },
            { TIME_PERIOD: '2021', GEO_PICT: 'Samoa', value: 52 }
        ];
        const table = pivotTable(sparse, 'TIME_PERIOD', 'GEO_PICT', dimensions);
        expect(table.cells['2020']['Samoa']).toBeUndefined();
        expect(table.cells['2021']['Fiji']).toBeUndefined();
    });

    it('falls back to first-seen order without a dimension structure', () => {
        const table = pivotTable(data, 'TIME_PERIOD', 'GEO_PICT', []);
        expect(table.rowKeys).toEqual(['2020', '2021']);
        expect(table.columnKeys).toEqual(['Fiji', 'Samoa']);
    });
});
