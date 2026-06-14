import { SDMXTheme } from '../components/types';

/**
 * Locale used for number formatting: the theme's numberFormat.locale when
 * set, otherwise the component language.
 */
export const resolveNumberLocale = (theme: SDMXTheme | undefined, language: string): string => {
    return theme?.numberFormat?.locale || language;
}

/**
 * Engine-neutral chart options derived from a theme, expressed as a partial
 * Highcharts options object. Applied at the lowest merge precedence so a
 * per-visual colorPalette (which sets explicit series colours) still wins,
 * and the engine defaults stand for anything the theme does not set.
 */
export const themeChartOptions = (theme: SDMXTheme | undefined): Record<string, any> => {
    if (!theme) {
        return {};
    }
    const options: Record<string, any> = {};
    if (theme.palette && theme.palette.length > 0) {
        options.colors = theme.palette;
    }
    if (theme.fontFamily?.data) {
        options.chart = { style: { fontFamily: theme.fontFamily.data } };
    }
    if (theme.fontFamily?.display) {
        const displayStyle = { style: { fontFamily: theme.fontFamily.display } };
        options.title = displayStyle;
        options.subtitle = displayStyle;
    }
    if (theme.numberFormat?.decimalSeparator) {
        options.lang = { decimalPoint: theme.numberFormat.decimalSeparator };
    }
    return options;
}
