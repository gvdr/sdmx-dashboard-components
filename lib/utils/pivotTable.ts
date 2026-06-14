/**
 * Pivot observation rows into a table: one row per distinct value of the
 * x-axis concept, one column per distinct value of the legend concept (or a
 * single value column when no legend concept is set). Row and column order
 * follows the dimension's declared value order when the structure is
 * available, otherwise first-seen order in the data.
 */

export type PivotTable = {
    rowConcept: string,
    rowKeys: string[],
    columnConcept?: string,
    columnKeys: string[],
    // cells[rowKey][columnKey] -> observation value (undefined when absent)
    cells: Record<string, Record<string, number | undefined>>
}

const orderedDistinct = (
    data: any[],
    concept: string,
    dimensions: any[]
): string[] => {
    const present = new Set<string>();
    data.forEach((row: any) => {
        const value = row[concept];
        if (value !== undefined && value !== null) {
            present.add(String(value));
        }
    });
    const dimension = dimensions.find((d: any) => d.id === concept);
    if (dimension?.values?.length) {
        const declared = dimension.values
            .map((v: any) => v.name)
            .filter((name: string) => present.has(name));
        // append any present values the structure did not declare, stable
        const extra = [...present].filter((name) => !declared.includes(name));
        return [...declared, ...extra];
    }
    return [...present];
}

export const pivotTable = (
    data: any[],
    rowConcept: string,
    columnConcept: string | undefined,
    dimensions: any[]
): PivotTable => {
    const rowKeys = orderedDistinct(data, rowConcept, dimensions);
    const SINGLE_COLUMN = '__value__';
    const columnKeys = columnConcept
        ? orderedDistinct(data, columnConcept, dimensions)
        : [SINGLE_COLUMN];

    const cells: Record<string, Record<string, number | undefined>> = {};
    rowKeys.forEach((rowKey) => {
        cells[rowKey] = {};
        columnKeys.forEach((columnKey) => {
            cells[rowKey][columnKey] = undefined;
        });
    });

    data.forEach((row: any) => {
        const rowKey = row[rowConcept] !== undefined && row[rowConcept] !== null ? String(row[rowConcept]) : undefined;
        if (rowKey === undefined || !(rowKey in cells)) {
            return;
        }
        const columnKey = columnConcept
            ? (row[columnConcept] !== undefined && row[columnConcept] !== null ? String(row[columnConcept]) : undefined)
            : SINGLE_COLUMN;
        if (columnKey === undefined || !(columnKey in cells[rowKey])) {
            return;
        }
        cells[rowKey][columnKey] = row.value;
    });

    return { rowConcept, rowKeys, columnConcept, columnKeys, cells };
}

export const SINGLE_VALUE_COLUMN = '__value__';
