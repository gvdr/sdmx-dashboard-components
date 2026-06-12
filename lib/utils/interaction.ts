/**
 * Helpers translating chart interaction targets back into SDMX dimension
 * coordinates. Data rows map dimension ids to value names (that is what the
 * parser exposes); consumers need codes to reconstruct queries, so the
 * dimension structures are used to translate names back to codes. When a
 * name has no matching code the name itself is kept, which holds for
 * TIME_PERIOD values.
 */

/**
 * Dimension coordinates of a single observation row.
 * @param row a data row as returned by SDMXParser.getData()
 * @param dimensions dimension structures from SDMXParser.getDimensions()
 */
export const buildInteractionConcepts = (row: any, dimensions: any[]): Record<string, string> => {
    const concepts: Record<string, string> = {};
    dimensions.forEach((dimension: any) => {
        const valueName = row?.[dimension.id];
        if (valueName === undefined || valueName === null) {
            return;
        }
        const code = dimension.values?.find((value: any) => value.name === valueName)?.id;
        concepts[dimension.id] = code !== undefined ? String(code) : String(valueName);
    });
    return concepts;
}

/**
 * Dimension coordinate shared by a whole series: the dimension whose value
 * name matches the series name (the legend dimension).
 * @param seriesName name of the clicked series
 * @param dimensions dimension structures from SDMXParser.getDimensions()
 */
export const buildSeriesConcepts = (seriesName: string, dimensions: any[]): Record<string, string> => {
    const concepts: Record<string, string> = {};
    dimensions.forEach((dimension: any) => {
        const match = dimension.values?.find((value: any) => value.name === seriesName);
        if (match) {
            concepts[dimension.id] = String(match.id);
        }
    });
    return concepts;
}
