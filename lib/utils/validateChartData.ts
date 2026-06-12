import { SDMXRenderError } from '../errors';

// chart types whose series are built by grouping observations on a second
// varying dimension; without one the series lookup yields nothing to render
const GROUPING_CHART_TYPES = ['bar', 'column', 'lollipop'];

export type VaryingDimension = {
    id: string,
    valueCount: number
}

/**
 * Count the distinct values each dimension takes in the fetched data and
 * return the dimensions, other than the x-axis one, that vary (two or more
 * distinct values).
 * @param data rows returned by SDMXParser.getData()
 * @param dimensions dimensions returned by SDMXParser.getDimensions()
 * @param xAxisConcept dimension id displayed on the x-axis
 */
export const findVaryingDimensions = (data: any[], dimensions: any[], xAxisConcept: string): VaryingDimension[] => {
    return dimensions
        .filter((dimension: any) => dimension.id !== xAxisConcept)
        .map((dimension: any) => {
            const distinct = new Set(
                data.map((row: any) => row[dimension.id]).filter((value: any) => value !== undefined)
            );
            return { id: dimension.id, valueCount: distinct.size };
        })
        .filter((dimension: VaryingDimension) => dimension.valueCount > 1);
}

/**
 * Validate that the fetched data can be shaped into unambiguous series for
 * the requested chart type. Throws an SDMXRenderError instead of letting the
 * chart render a blank panel (grouping chart with nothing to group on) or a
 * misleading "see-saw" line (several dimensions merged into one series).
 * The error messages are a public contract: agents and UIs read them to fix
 * the dashboard config.
 * @param chartType chart type from the visual config
 * @param xAxisConcept dimension id displayed on the x-axis (after defaults are applied)
 * @param legendConcept dimension id from legend.concept, empty when not configured
 * @param data rows returned by SDMXParser.getData()
 * @param dimensions dimensions returned by SDMXParser.getDimensions()
 */
export const validateSeriesDimensions = (
    chartType: string,
    xAxisConcept: string,
    legendConcept: string,
    data: any[],
    dimensions: any[]
): void => {
    if (!xAxisConcept || xAxisConcept === 'MULTI' || data.length === 0) {
        return;
    }
    const varying = findVaryingDimensions(data, dimensions, xAxisConcept);

    if (GROUPING_CHART_TYPES.includes(chartType) && varying.length === 0) {
        throw new SDMXRenderError(
            'ERR_NO_SERIES_DIMENSION',
            `Chart type=${chartType} with xAxis=${xAxisConcept} needs at least one other varying dimension to group bars/columns. Only ${xAxisConcept} varies in this query. Fix: switch chart type to line or pie, widen the data query so a second dimension varies (e.g. remove lastNObservations or broaden the filter), or set legend.concept to a dimension with multiple values.`,
            { detail: { chartType, xAxisConcept, varyingDimensions: [] } }
        );
    }

    if (varying.length >= 2 && !legendConcept) {
        const varyingList = varying
            .map((dimension: VaryingDimension) => `${dimension.id} (${dimension.valueCount} values)`)
            .join(', ');
        throw new SDMXRenderError(
            'ERR_AMBIGUOUS_SERIES',
            `Chart type=${chartType} with xAxis=${xAxisConcept} has ${varying.length} other varying dimensions: ${varyingList}. Their observations would be merged into a single series, rendering an artefact instead of the data. Fix: set legend.concept to one of the varying dimensions, or narrow the data query so that only one dimension besides ${xAxisConcept} varies.`,
            { detail: { chartType, xAxisConcept, varyingDimensions: varying } }
        );
    }
}
