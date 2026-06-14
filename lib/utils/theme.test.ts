import { describe, it, expect } from 'vitest';
import { resolveNumberLocale, themeChartOptions } from './theme';

describe('resolveNumberLocale', () => {
    it('prefers the theme number locale over the component language', () => {
        expect(resolveNumberLocale({ numberFormat: { locale: 'fr-FR' } }, 'en')).toBe('fr-FR');
    });
    it('falls back to the component language', () => {
        expect(resolveNumberLocale(undefined, 'en')).toBe('en');
        expect(resolveNumberLocale({ palette: ['#000'] }, 'en')).toBe('en');
    });
});

describe('themeChartOptions', () => {
    it('returns an empty object for no theme', () => {
        expect(themeChartOptions(undefined)).toEqual({});
    });

    it('maps palette, fonts, and decimal separator to engine-neutral options', () => {
        const options = themeChartOptions({
            palette: ['#111', '#222'],
            fontFamily: { display: 'Georgia', data: 'Inter' },
            numberFormat: { decimalSeparator: ',' }
        });
        expect(options.colors).toEqual(['#111', '#222']);
        expect(options.chart.style.fontFamily).toBe('Inter');
        expect(options.title.style.fontFamily).toBe('Georgia');
        expect(options.subtitle.style.fontFamily).toBe('Georgia');
        expect(options.lang.decimalPoint).toBe(',');
    });

    it('omits keys for unset theme fields', () => {
        const options = themeChartOptions({ palette: ['#111'] });
        expect(options.colors).toEqual(['#111']);
        expect(options.chart).toBeUndefined();
        expect(options.title).toBeUndefined();
        expect(options.lang).toBeUndefined();
    });
});
