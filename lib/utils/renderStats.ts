import { VisualRenderStatus } from '../components/types';

/**
 * Build the stats block of a "rendered" VisualRenderStatus from the fetched
 * observation rows. Time periods sort lexicographically, which orders ISO
 * SDMX reporting periods correctly within one frequency.
 * @param data rows returned by SDMXParser.getData() (one or more datasets concatenated)
 * @param seriesCount number of series the visual draws
 */
export const computeRenderStats = (data: any[], seriesCount: number): NonNullable<VisualRenderStatus['stats']> => {
    const timePeriods = data
        .map((row: any) => row.TIME_PERIOD)
        .filter((value: any) => value !== undefined && value !== null)
        .map(String)
        .sort();
    const stats: NonNullable<VisualRenderStatus['stats']> = {
        observationCount: data.length,
        seriesCount
    };
    if (timePeriods.length > 0) {
        stats.timePeriodRange = [timePeriods[0], timePeriods[timePeriods.length - 1]];
    }
    return stats;
}
