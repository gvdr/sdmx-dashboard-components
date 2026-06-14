import React from 'react';
import { pivotTable, SINGLE_VALUE_COLUMN } from '../utils/pivotTable';

// inline screen-reader-only styling so the fallback does not depend on a
// particular CSS framework being loaded by the consumer
const srOnly: React.CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    padding: 0,
    margin: -1,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0
};

/**
 * A visually hidden data table giving assistive technology the observations
 * behind a chart, independent of the charting engine's own accessibility
 * support. Rows are the x-axis concept values, columns the legend concept
 * values (or a single value column).
 */
const HiddenDataTable = ({
    data,
    dimensions,
    xAxisConcept,
    legendConcept,
    caption,
    valueHeader,
    numberLocale
}: {
    data: any[],
    dimensions: any[],
    xAxisConcept: string,
    legendConcept?: string,
    caption: string,
    valueHeader: string,
    numberLocale: string
}) => {
    if (!data || data.length === 0 || !xAxisConcept) {
        return null;
    }
    const table = pivotTable(data, xAxisConcept, legendConcept, dimensions);
    const showColumnHeaders = table.columnKeys.length > 0 && table.columnKeys[0] !== SINGLE_VALUE_COLUMN;
    const formatValue = (value: number | undefined) =>
        value === undefined || value === null ? '' : value.toLocaleString(numberLocale);

    return (
        <div style={srOnly}>
            <table>
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">{xAxisConcept}</th>
                        {showColumnHeaders
                            ? table.columnKeys.map((columnKey) => <th key={columnKey} scope="col">{columnKey}</th>)
                            : <th scope="col">{valueHeader}</th>
                        }
                    </tr>
                </thead>
                <tbody>
                    {table.rowKeys.map((rowKey) => (
                        <tr key={rowKey}>
                            <th scope="row">{rowKey}</th>
                            {table.columnKeys.map((columnKey) => (
                                <td key={columnKey}>{formatValue(table.cells[rowKey][columnKey])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default HiddenDataTable;
