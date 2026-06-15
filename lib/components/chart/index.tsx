"use client"

import React, { useState, useEffect, useRef, useMemo } from "react";
import { HighchartsReact } from "highcharts-react-official";
import Highcharts from 'highcharts';
import highchartsMore from "highcharts/highcharts-more.js";
import highchartsExporting from "highcharts/modules/exporting.js";
import highchartsAccessibility from "highcharts/modules/accessibility.js";
import highchartsExportData from "highcharts/modules/export-data.js";
import highchartsDumbbell from "highcharts/modules/dumbbell.js"
import highchartsDrilldown from "highcharts/modules/drilldown.js"
import highchartsLollipop from "highcharts/modules/lollipop.js"
import highchartsTreemap from "highcharts/modules/treemap.js"
import { SDMXParser } from '../../utils/sdmxParser';
import { parseTextExpr } from '../../utils/parseTextExpr';
import { fetchDataExprOperand, parseDataExpr } from "../../utils/parseDataExpr";
import { parseDate } from "../../utils/parseDate";
import { InfoCircle } from "react-bootstrap-icons";
import { Button } from "react-bootstrap";
import { SDMXChartConfig, SDMXFetcher, SDMXTheme, VisualInteraction, VisualRenderStatus } from "../types";
import { SDMXRenderError, toSDMXRenderError } from "../../errors";
import { validateSeriesDimensions } from "../../utils/validateChartData";
import { computeRenderStats } from "../../utils/renderStats";
import { observeContainerResize } from "../../utils/observeContainerResize";
import { createTransport, FetchTelemetry } from "../../utils/transport";
import { buildInteractionConcepts, buildSeriesConcepts } from "../../utils/interaction";
import { themeChartOptions, resolveNumberLocale } from "../../utils/theme";
import HiddenDataTable from "../hiddenDataTable";
import { AlignValue } from "highcharts";
import { merge } from "ts-deepmerge";
import { parse as parseExpr, EvalAstFactory, Scope } from "jexpr";

// Highcharts feature modules are registered lazily on first client render
// rather than at import time, so the module is side-effect-free and can be
// imported in a server (no-DOM) process without initialising the engine.
let highchartsModulesRegistered = false;
const ensureHighchartsModules = () => {
    if (highchartsModulesRegistered || typeof Highcharts !== 'object') {
        return;
    }
    highchartsMore(Highcharts)
    highchartsExporting(Highcharts);
    highchartsAccessibility(Highcharts);
    highchartsDrilldown(Highcharts);
    highchartsDumbbell(Highcharts);
    highchartsLollipop(Highcharts);
    highchartsExportData(Highcharts);
    highchartsTreemap(Highcharts);
    highchartsModulesRegistered = true;
}

interface ChartProps extends HighchartsReact.Props {
    config: SDMXChartConfig;
    language: string;
    placeholder?: React.JSX.Element;
    callback?: (chart: Highcharts.Chart) => void;
    fetcher?: SDMXFetcher;
    onVisualRender?: (status: VisualRenderStatus) => void;
    onDataFetch?: (telemetry: FetchTelemetry) => void;
    onUserInteraction?: (interaction: VisualInteraction) => void;
    renderLoading?: (visualId: string) => React.ReactNode;
    renderEmpty?: (visualId: string) => React.ReactNode;
    renderError?: (error: SDMXRenderError) => React.ReactNode;
    autoResize?: boolean;
    theme?: SDMXTheme;
}

const Chart = ({ config, language, placeholder, callback, fetcher, onVisualRender, onDataFetch, onUserInteraction, renderLoading, renderEmpty, renderError: renderErrorSlot, autoResize = true, theme, ...props }: ChartProps) => {

    const [hcOptions, setHcOptions] = useState<Highcharts.Options>({
        title: {
            text: "Loading..."
        }
    })

    const [isLoading, setIsLoading] = useState(true)
    const [renderError, setRenderError] = useState<Error | null>(null)
    // observations behind the chart, for the visually hidden accessible table
    const [a11yTable, setA11yTable] = useState<{ rows: any[], dimensions: any[], xAxisConcept: string, legendConcept?: string, caption: string, valueHeader: string, numberLocale: string } | null>(null)

    const chartComponentRef = useRef<HighchartsReact.RefObject>(null);

    // read through a ref so an inline callback prop does not re-trigger the
    // data effect on every parent render
    const onVisualRenderRef = useRef(onVisualRender);
    useEffect(() => {
        onVisualRenderRef.current = onVisualRender;
    }, [onVisualRender]);
    const reportRenderStatus = (status: VisualRenderStatus) => {
        onVisualRenderRef.current?.(status);
    }

    const onDataFetchRef = useRef(onDataFetch);
    useEffect(() => {
        onDataFetchRef.current = onDataFetch;
    }, [onDataFetch]);

    const onUserInteractionRef = useRef(onUserInteraction);
    useEffect(() => {
        onUserInteractionRef.current = onUserInteraction;
    }, [onUserInteraction]);

    // Key effects on the config's content, not its object identity, so a
    // consumer passing an inline config={{...}} literal (a new object every
    // render) does not re-fetch on every render — which, combined with a
    // state-updating callback, would loop. A genuine content change produces
    // a different key and re-runs as expected.
    const configKey = JSON.stringify(config);
    const themeKey = JSON.stringify(theme);

    // dedup, cache, and retry per rendered config; a dashboard-provided
    // transport passes through unchanged so visuals share its cache
    const transport = useMemo(
        () => createTransport(fetcher, (telemetry) => onDataFetchRef.current?.(telemetry)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [configKey, language, fetcher]
    );

    // re-measure when the container resizes without a window resize event
    // (sidebars opening, preview panes dragging, CSS transitions); the
    // observer attaches once the chart has mounted, hence the isLoading dep
    useEffect(() => {
        if (!autoResize) {
            return;
        }
        const container = chartComponentRef.current?.container?.current;
        if (!container) {
            return;
        }
        return observeContainerResize(container, () => {
            chartComponentRef.current?.chart?.reflow();
        });
    }, [autoResize, isLoading]);

    const sortByDimension = (data: any, dimensionId: string) => {

        return data.sort((a: any, b: any) => {
            if (dimensionId === "TIME_PERIOD") {
                return parseInt(a[dimensionId]) - parseInt(b[dimensionId])
            } else {
                return a[dimensionId].localeCompare(b[dimensionId])
            }
        })
    }

    const sortByValue = (data: any, order: string) => {
        data.sort((a: any, b: any) => {
            if (order === 'asc') {
                return a.value - b.value
            } else {
                return b.value - a.value
            }
        })
        return data
    }

    const getLatestValue = (data: any, dimension: string) => {
        let values  = []
        values = data.map((dataPoint: any) => dataPoint[dimension])
                    .map((e: any, i: number, final: any) => final.indexOf(e) === i && i)
                    .filter((e: any) => data[e]).map((e: any) => data[e])
        return values;
    }

    useEffect(() => {

        ensureHighchartsModules()
        setRenderError(null)
        setA11yTable(null)
        reportRenderStatus({ visualId: config.id, status: 'loading' })

        const numberLocale = resolveNumberLocale(theme, language);

        const dataObjs = parseDataExpr(config.data);

        if (config.download) {
            // ExportData(Highcharts)
        }

        const chartType = config.type
        if (!chartType) {
            throw new Error('Chart type not defined');
        }
        const hcExtraOptions: Highcharts.Options = {
            plotOptions: {
                [chartType]: {}
            },
        };

        let seriesData: any[] = [];
        let xAxisValue: any[] = [];

        const dataPromises = dataObjs.map((dataObj) => {
            const parser = new SDMXParser();
            return parser.getDatasets(dataObj.dataFlowUrl, {
                headers: new Headers({
                    // no SDMX Accept header: format=jsondata (added by the
                    // parser) selects the dialect; a v2.0 Accept header makes
                    // ECB 406 (see §5 of the improvement doc)
                    "Accept-Language": language
                }),
                fetcher: transport
            }).then(() => {
                let data = parser.getData();
                if (data.length === 0) {
                    throw new SDMXRenderError(
                        'ERR_EMPTY',
                        `The data query for visual ${config.id} returned zero observations. Fix: widen the data query (e.g. broaden the filter or the period) or check that the dataflow contains data for the requested slice.`,
                        { detail: { url: dataObj.dataFlowUrl } }
                    );
                }
                const attributes = parser.getAttributes();
                // if alternate label specified in the DATA field, the label is appended to the data with key xAxisConcept
                if (dataObj.alternateLabel) {
                    data.forEach((_dataItem: any, index: number, data: [any]) => {
                        data[index][config.xAxisConcept] = dataObj.alternateLabel;
                    });
                }
                // if operation specified in the DATA field, it is applied here whether the operand is an attribute or another SDMX request
                if (dataObj.operator) {
                    if (dataObj.operator === 'hist') {
                        // we compute the histogram of values along the xAxisConcept
                        // we also need to get all the values for the xAxisConcept dimension to take into account the 'no-data'
                        let histData: any[] = []
                        data.forEach((_dataItem: any) => {
                            let histItemIndex = histData.findIndex(item => {
                                if (item.binValue === _dataItem.value) {
                                    let found = true
                                    return found
                                } else {
                                    return false
                                }
                            })
                            if (histItemIndex === -1) {
                                let histItem: any = {}
                                histItem[config.xAxisConcept] = _dataItem[config.xAxisConcept]
                                histItem.value = 1
                                histItem.binValue = _dataItem.value
                                histData.push(histItem)
                            } else {
                                histData[histItemIndex].value += 1
                                histData[histItemIndex][config.xAxisConcept] = `${histData[histItemIndex][config.xAxisConcept]}<br/>${_dataItem[config.xAxisConcept]}`
                            }
                        })
                        return [histData, parser.getDimensions()]

                    } else if (dataObj.operator === "expr") {
                        const scope: Scope = {x0: data.map((item: any) => item.value)}
                        const dataPromises = fetchDataExprOperand(dataObj.exprOperand, data, scope, attributes, language, transport)
                        return Promise.all(dataPromises).then(() => {
                            const astFactory = new EvalAstFactory();
                            const expr = parseExpr(dataObj.expression, astFactory);

                            // compute the expression for each data point
                            data.forEach((item: any, index: number) => {
                                const scopeValues : Scope = {}
                                Object.keys(scope).forEach((varKey: string) => {
                                    scopeValues[varKey] = scope[varKey][index];
                                });
                                item.value = expr?.evaluate(scopeValues)
                            })
                            return [data, parser.getDimensions(), parser.getActiveDimensions()]
                        })
                    }
                } else {
                    return [data, parser.getDimensions(), parser.getActiveDimensions()];
                }
            })
        });
        let titleText = config.title?'Loading...':'';
        let subtitleText = config.subtitle?'Loading...':'';
        // engine-neutral axis titles, resolved per language; left undefined
        // when not configured so the engine defaults stand
        let xAxisTitleText: string | undefined;
        let yAxisTitleText: string | undefined;
        const resolveText = (text: SDMXChartConfig['xAxisTitle']): string | undefined => {
            if (!text) {
                return undefined;
            }
            return typeof text.text === 'string' ? text.text : text.text[language];
        }
        let allRows: any[] = [];
        // dimension structures for the interaction handlers; charts with
        // several datasets share one structure in practice, the last wins
        let interactionDimensions: any[] = [];
        // resolved x-axis and legend concepts for the accessible data table
        let a11yXAxisConcept = '';
        let a11yLegendConcept: string | undefined;
        Promise.all(dataPromises).then((sdmxObjs) => {
            sdmxObjs.forEach((sdmxObj: any) => {
                const data = sdmxObj[0];
                const dimensions = sdmxObj[1];
                const activeDimensions = sdmxObj[2];
                allRows = allRows.concat(data);
                interactionDimensions = dimensions;

                if(typeof config.title == 'string') {
                    titleText = parseTextExpr(config.title, dimensions)
                } else if (typeof config.title === 'object') {
                    titleText = typeof config.title.text == 'string'? parseTextExpr(config.title.text, dimensions) : parseTextExpr(config.title.text[language], dimensions)
                }
                if(typeof config.subtitle == 'string') {
                    subtitleText = parseTextExpr(config.subtitle, dimensions)
                } else if (typeof config.subtitle === 'object') {
                    subtitleText = typeof config.subtitle.text == 'string'? parseTextExpr(config.subtitle.text, dimensions) : parseTextExpr(config.subtitle.text[language], dimensions)
                }
                const resolvedXAxisTitle = resolveText(config.xAxisTitle);
                if (resolvedXAxisTitle !== undefined) {
                    xAxisTitleText = parseTextExpr(resolvedXAxisTitle, dimensions)
                }
                const resolvedYAxisTitle = resolveText(config.yAxisTitle);
                if (resolvedYAxisTitle !== undefined) {
                    yAxisTitleText = parseTextExpr(resolvedYAxisTitle, dimensions)
                }

                const availableConcepts = dimensions.map((dimension: any) => dimension.id);
                // check if xAxisConcept exists in data
                if (config.xAxisConcept && config.xAxisConcept !== 'MULTI') {
                    const xAxisDimension = dimensions.find((dimension: any) => dimension.id === config.xAxisConcept);
                    if (!xAxisDimension) {
                        throw new SDMXRenderError(
                            'ERR_CONCEPT_NOT_FOUND',
                            `xAxisConcept ${config.xAxisConcept} not found in the dataflow. Available concepts: ${availableConcepts.join(', ')}. Fix: set xAxisConcept to one of the available concepts.`,
                            { detail: { concept: config.xAxisConcept, role: 'xAxisConcept', available: availableConcepts } }
                        );
                    }
                }
                // check if legendConcept exists in dataFlow
                if (config.legend && config.legend.concept && config.legend.concept !== 'MULTI') {
                    const legendDimension = dimensions.find((dimension: any) => dimension.id === config?.legend?.concept);
                    if (!legendDimension) {
                        throw new SDMXRenderError(
                            'ERR_CONCEPT_NOT_FOUND',
                            `legendConcept ${config.legend.concept} not found in the dataflow. Available concepts: ${availableConcepts.join(', ')}. Fix: set legend.concept to one of the available concepts.`,
                            { detail: { concept: config.legend.concept, role: 'legend.concept', available: availableConcepts } }
                        );
                    }
                }

                let xAxisConcept = config.xAxisConcept;
                let legendConcept = config?.legend?.concept || "";

                // fail with a descriptive error instead of a blank panel or a
                // misleading single merged series (see-saw plot)
                validateSeriesDimensions(
                    chartType,
                    xAxisConcept || (chartType === 'line' ? 'TIME_PERIOD' : ''),
                    legendConcept,
                    data,
                    dimensions
                );

                // check if colorPalette is expressed with codes or colorIndexes
                // if colorPalette uses number, it means that it is colorIndex
                // otherwise it is a HEX color code
                if ( config.colorPalette && config.colorPalette[legendConcept] && Object.values(config.colorPalette[legendConcept]).every((value: string|number) => {
                    return typeof value === 'number'
                })) {
                    hcExtraOptions['chart'] = {
                        'colorCount': Object.keys(config.colorPalette[legendConcept]).length
                    }
                }

                if (chartType === 'line') {
                    // in case xAxisConcept is empty, we use TIME_PERIOD
                    xAxisConcept = xAxisConcept || 'TIME_PERIOD';
                    // in case legendConcept is empty, we use the first dimension which is not TIME_PERIOD
                    legendConcept = legendConcept || dimensions.find((dimension: any) => dimension.id !== xAxisConcept)['id']
                    if (!legendConcept) {
                        throw new Error(`No other dimension than ${xAxisConcept} found`);
                    }
                    // for (multiple) line charts, we create multiple series for each legendConcept dimension values and using xAxisConcept as the x-axis dimension
                    let serieDimensions = dimensions.find((dimension: any) => dimension.id === legendConcept);
                    if (xAxisConcept === "TIME_PERIOD") {
                        // we assume that line charts have a time dimension represented on x-axis
                        const freqDimension = dimensions.find((dimension: any) => dimension.id === "FREQ");
                        let unit = '';
                        let xAxisLabelformat = '';
                        if (freqDimension.values[0].id === "A") {
                            unit = "year";
                            xAxisLabelformat = "{value:%Y}";
                        } else if (freqDimension.values[0].id === "Q" || freqDimension.values[0].id === 'M') {
                            unit = "month";
                            xAxisLabelformat = "{value:%b %Y}";
                        }
                        hcExtraOptions["xAxis"] = {
                            type: "datetime",
                            units: [[unit, []]],
                            labels: {
                                format: xAxisLabelformat
                            }
                        }
                    } else {
                        hcExtraOptions["xAxis"] = {
                            type: "category",
                            categories: data.map((val: any) => val[xAxisConcept])
                        }
                    }
                    serieDimensions.values.sort((a: any, b: any) => a.name.localeCompare(b.name)).forEach((serieDimension: any) => {
                        // a serie is created for each of the serie's dimension value
                        const serieData = data.filter((val: any) => val[legendConcept||""] === serieDimension.name);
                        if(serieData.length == 0) {
                          // continue if no data for this serie
                          return
                        }
                        const sortedData = sortByDimension(serieData, xAxisConcept);
                        const yAxisValue = sortedData.map((val: any) => {
                            return {
                                ...val,
                                y: val["value"],
                                x: parseDate(val[xAxisConcept])
                            };
                        });
                        let serieDataObj: any = {
                            name: serieDimension.name,
                            data: yAxisValue,
                        }
                        if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                            serieDataObj['color'] = config.colorPalette[legendConcept][serieDimension.id]
                            if (typeof config.colorPalette[legendConcept][serieDimension.id] === 'number') {
                                serieDataObj.colorIndex = config.colorPalette[legendConcept][serieDimension.id]
                                serieDataObj.className = `highcharts-colorPalette-${serieDimensions.id}`
                            } else {
                                serieDataObj["color"] = config.colorPalette[legendConcept][serieDimension.id]
                            }
                        }

                        seriesData.push(serieDataObj);
                    });
                } else if (chartType === 'column' || chartType === 'bar' || chartType === 'lollipop' || chartType === 'treemap') {
                    if (!xAxisConcept) {
                        throw new Error('No xAxis concept found')
                    }
                    let legendDimension: any = {}
                    // in case legendConcept is empty, we take the other active dimension and display a serie for each value
                    if (!legendConcept) {
                        legendDimension = activeDimensions.find((dimension: any) => dimension.id !== xAxisConcept)
                    } else {
                        legendDimension = dimensions.find((dimension: any) => dimension.id === legendConcept)
                    }
                    const xAxisDimension = activeDimensions.find((dimension: any) => dimension.id === xAxisConcept)
                    legendDimension.values.sort((a: any, b: any) => a.id.localeCompare(b.id)).forEach((legendDimensionValue: any) => {
                        const legendSerie = data.filter((val: any) => val[legendDimension.id] === legendDimensionValue.name);
                        let sortedData = sortByDimension(legendSerie, xAxisConcept)
                        if (config.sortByValue) {
                            sortedData = sortByValue(sortedData, config.sortByValue);
                        }
                        const latestValues = getLatestValue(sortedData, xAxisConcept)
                        const yAxisValue = latestValues
                            .filter((val: any) => val.value !== null ) // remove null values from chart
                            .map((val: any) => {
                                if ((config.extraOptions as any)?.plotOptions?.[chartType]?.colorByPoint) {
                                    // add color to each point of the serie if colorByPoint is set to true
                                    const valXAxis = xAxisDimension.values.find((xVal: any) => xVal.name === val[xAxisConcept])
                                    if (typeof config.colorPalette?.[xAxisConcept]?.[valXAxis.id] === 'number') {
                                        val.className = `highcharts-colorPalette-${xAxisDimension.id}`
                                        val.colorIndex = config.colorPalette[xAxisConcept][valXAxis.id]
                                    } else if (typeof config.colorPalette?.[xAxisConcept]?.[valXAxis.id] === 'string') {
                                        val.color = config.colorPalette[xAxisConcept][valXAxis.id]
                                    }
                                }
                                return {
                                    ...val,
                                    y: val["value"],
                                    name: val[xAxisConcept]
                                }
                            })

                        // add category to xAxis
                        yAxisValue.forEach((val: any) => {
                            if (!xAxisValue.includes(val[xAxisConcept])) {
                                xAxisValue.push(val[xAxisConcept])
                            }
                        });
                        if (yAxisValue.length > 0) {
                            let serieDataObj: any = {
                                name: legendDimensionValue.name,
                                data: yAxisValue,
                            }
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                // if colorPalette set for legendConcept, we use the same color for every point of the serie
                                if (typeof config.colorPalette[legendConcept][legendDimensionValue.id] === 'number') {
                                    serieDataObj.colorIndex = config.colorPalette[legendConcept][legendDimensionValue.id]
                                    serieDataObj.className = `highcharts-colorPalette-${legendDimension.id}`
                                } else {
                                    serieDataObj["color"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                                }
                            }

                            seriesData.push(serieDataObj)
                        }
                    })

                    hcExtraOptions["xAxis"] = {
                        type: 'category'
                    }

                } else if (chartType === 'drilldown') {
                    const drilldownXAxisConcept = config.drilldown?.xAxisConcept;
                    if (!drilldownXAxisConcept) {
                        throw new Error('No drilldown xAxis concept found')
                    }
                    if (!legendConcept) {
                        throw new Error('No legend concept found')
                    }
                    const xAxisDimension = dimensions.find((dimension: any) => dimension.id === xAxisConcept);
                    const legendDimension = dimensions.find((dimension: any) => dimension.id === legendConcept);
                    // const drilldownXAxisDimension = dimensions.find((dimension: any) => dimension.id === drilldownXAxisConcept)

                    let dataDrilldownData: any[] = []
                    legendDimension.values.sort((a: any, b: any) => a.id.localeCompare(b.id)).forEach((legendDimensionValue: any) => {
                        const legendSerie = data.filter((val: any) => val[legendConcept] === legendDimensionValue.name);
                        let legendSerieData: any[] = []
                        xAxisDimension.values.forEach((xAxisDimensionValue: any) => {
                            let tmpArr = legendSerie
                                .filter((val: any) => val[xAxisConcept] === xAxisDimensionValue.name)

                            // sort data by drilldownXAxisConcept ASC
                            tmpArr = sortByDimension(tmpArr, drilldownXAxisConcept)
                            // either the "Total" value or the latest value is used to display in the column chart of drilldown
                            let legendSerieDataValue = tmpArr.find((val: any) => val[drilldownXAxisConcept] === "Total")
                            if (drilldownXAxisConcept === "TIME_PERIOD") {
                                legendSerieDataValue = tmpArr[tmpArr.length - 1]
                            } else {
                                // filter out the "Total" value from the drilled down data array
                                tmpArr = tmpArr.filter((val: any) => val[drilldownXAxisConcept] !== "Total")
                            }

                            if (tmpArr.length === 0) {
                                return
                            }
                            let legendSerieDataObj: any = {
                                ...legendSerieDataValue,
                                name: xAxisDimensionValue.name,
                                drilldown: `${xAxisDimensionValue.name}-${legendDimensionValue.name}`,
                                y: legendSerieDataValue["value"]
                            }
                            // if colorByPoint is true, we use the colorPalette to color the series points, each column is colored differently
                            if ((config.extraOptions as any)?.plotOptions?.column?.colorByPoint) {
                                if (typeof config?.colorPalette?.[xAxisConcept]?.[xAxisDimensionValue.id] === 'number') {
                                    legendSerieDataObj.colorIndex = config?.colorPalette?.[xAxisConcept]?.[xAxisDimensionValue.id]
                                    legendSerieDataObj.className = `highcharts-colorPalette-${xAxisDimension.id}`
                                } else {
                                    legendSerieDataObj.color = config?.colorPalette?.[xAxisConcept]?.[xAxisDimensionValue.id]
                                }
                            }
                            legendSerieData.push(legendSerieDataObj);

                            let drilldownSerieObj: any = {
                                id: `${xAxisDimensionValue.name}-${legendDimensionValue.name}`,
                                type: (drilldownXAxisConcept === "TIME_PERIOD" ? 'line' : 'column'),
                                name: `${legendDimensionValue.name}`,
                                // className: `highcharts-colorPalette-${xAxisDimension.id}`,
                                data: tmpArr.map((value: any) => {
                                    return {
                                        ...value,
                                        name: value[drilldownXAxisConcept],
                                        className: Object.keys(config.colorPalette || {}).includes(xAxisDimension.id) ? `highcharts-colorPalette-${xAxisDimension.id}` : "",
                                        y: value["value"]
                                    }
                                })
                            }
                            // depending on what is available in the passed object config `colorPalette` we use them to color the series
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(xAxisConcept)) {
                                // else if colorPalette specifies a color based on the xAxisConcept, we apply it
                                if (typeof config.colorPalette?.[xAxisConcept]?.[xAxisDimensionValue.id] === 'number') {
                                    drilldownSerieObj["colorIndex"] = config.colorPalette[xAxisConcept][xAxisDimensionValue.id]
                                    legendSerieDataObj.className = `highcharts-colorPalette-${legendConcept}`
                                    drilldownSerieObj.className = `highcharts-colorPalette-${xAxisDimension.id}`
                                } else {
                                    drilldownSerieObj["color"] = config.colorPalette[xAxisConcept][xAxisDimensionValue.id]
                                }
                            } else if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                // if colorPalette specifies a color based on the legendConcept, we apply it to the drilldown serie
                                if (typeof config.colorPalette?.[legendConcept]?.[legendDimensionValue.id] === 'number') {
                                    drilldownSerieObj['colorIndex'] = config.colorPalette[legendConcept][legendDimensionValue.id]
                                    legendSerieDataObj.className = `highcharts-colorPalette-${legendConcept}`
                                    drilldownSerieObj.className = `highcharts-colorPalette-${legendConcept}`
                                } else {
                                    drilldownSerieObj["color"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                                }
                            }

                            if (config.colorPalette && Object.keys(config.colorPalette).includes(drilldownXAxisConcept)) {
                                // on top of that, if colorPalette specifies a color based on the drilldownXAxisConcept, we apply it to the drilldown serie
                                drilldownSerieObj.data = drilldownSerieObj.data.map((item: any) => {
                                    const dimId = dimensions.find((dim: any) => dim.id === drilldownXAxisConcept).values.find((val: any) => val.name === item[drilldownXAxisConcept]).id
                                    let colorObj: any = {
                                        color: config.colorPalette?.[drilldownXAxisConcept][dimId]
                                    }
                                    if (typeof config.colorPalette?.[drilldownXAxisConcept]?.[dimId] === 'number') {
                                        colorObj = {
                                            colorIndex: config.colorPalette?.[drilldownXAxisConcept][dimId]
                                        }
                                    }
                                    return {
                                        ...item,
                                        ...colorObj
                                    }
                                })
                            }

                            dataDrilldownData.push(drilldownSerieObj)
                        })


                        if (legendSerieData.length !== 0) {
                            let sortedData = sortByDimension(legendSerieData, xAxisDimension.id)
                            if (config.sortByValue) {
                                sortedData = sortByValue(sortedData, config.sortByValue);
                            }
                            let seriesDataObj: any = {
                                name: legendDimensionValue.name,
                                data: sortedData
                            }
                            if (config.colorPalette && Object.keys(config.colorPalette).includes(legendConcept)) {
                                if (typeof config.colorPalette?.[legendConcept]?.[legendDimensionValue.id] === 'number') {
                                    seriesDataObj["colorIndex"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                                    seriesDataObj.className = `highcharts-colorPalette-${legendConcept}`
                                } else {
                                    seriesDataObj["color"] = config.colorPalette[legendConcept][legendDimensionValue.id]
                                }
                            }
                            seriesData.push(seriesDataObj)
                        }

                    })
                    // move the serie with the more data to the top of the array to keep sorting
                    seriesData.sort((a: any, b: any) => {
                        return b.data.length - a.data.length
                    })
                    hcExtraOptions["drilldown"] = {
                        allowPointDrilldown: false,
                        series: dataDrilldownData
                    }
                    hcExtraOptions["xAxis"] = {
                        type: 'category'
                    }
                } else if (chartType === 'pie') {
                    // other chart type (bar, pie) only one serie is created using the dimension specified in xAxisConcept
                    const sortedData = sortByDimension(data, xAxisConcept);
                    xAxisValue = sortedData.map((val: any) => {
                        return val[xAxisConcept];
                    });
                    hcExtraOptions["xAxis"] = {
                        type: 'category',
                        categories: xAxisValue
                    }
                    const yAxisValue = sortedData.map((val: any) => {
                        return {
                            ...val,
                            y: val["value"],
                            name: xAxisConcept ? val[xAxisConcept] : val[legendConcept || ""],
                        };
                    });

                    // in case of "boolean" pie chart with only 2 values resulting of a hist, we order values DESC (true first)
                    if (yAxisValue.length == 2 && Object.keys(yAxisValue[0]).includes("binValue")) {
                        yAxisValue.sort((a: any, b: any) => b.binValue - a.binValue)
                    }

                    if (config.labels) {
                        hcExtraOptions["plotOptions"] = {
                            [chartType]: {
                                dataLabels: {
                                    enabled: true,
                                    formatter: function (this: any) {
                                        if (config?.unit?.text === '%') {
                                            return `${this.point?.name}: ${this.point?.percentage.toFixed(config.decimals)} %`
                                        } else {
                                            return `${this.point?.y?.toLocaleString(numberLocale)}`
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // force legend for Pie charts
                    if (config.legend && chartType === 'pie') {
                        hcExtraOptions["plotOptions"] = {
                            [chartType]: {
                                showInLegend: true
                            }
                        }
                    }

                    // append data to the serie
                    if (seriesData.length === 0) {
                        seriesData = [{
                            name: titleText || dimensions.find((dim: any) => dim.id === config.legend?.concept).values[0].name,
                            data: yAxisValue,
                        },];
                    } else {
                        seriesData[0].data.push(...yAxisValue);
                    }
                }
                a11yXAxisConcept = xAxisConcept || (chartType === 'line' ? 'TIME_PERIOD' : '');
                a11yLegendConcept = legendConcept || undefined;
            })
            let legendAlign: AlignValue = "center"
            if (config?.legend?.location) {
                if (config.legend.location == "left" || config.legend.location == "right") {
                    legendAlign = config.legend.location
                }
            }
            if (config.labels) {
                hcExtraOptions["plotOptions"]= {
                    [chartType] : {
                        dataLabels: {
                            enabled: true,
                            formatter: function (this: any) {
                                if (config?.unit?.text === '%' && this.point.percentage !== undefined) {
                                    if (chartType === "pie") {
                                        return `${this.point?.name}: ${this.point?.percentage.toFixed(config.decimals)} %`
                                    } else {
                                        return `${this.point?.percentage.toFixed(config.decimals)} %`
                                    }
                                } else {
                                    return `${this.point?.y?.toLocaleString(numberLocale)}`
                                }
                            }
                        }
                    }
                }
            }

            setIsLoading(false)

            const emitInteraction = (kind: VisualInteraction['kind'], concepts: Record<string, string>, value?: number, timePeriod?: string) => {
                const interaction: VisualInteraction = { visualId: config.id, kind, concepts };
                if (value !== undefined && value !== null) {
                    interaction.value = value;
                }
                if (timePeriod !== undefined && timePeriod !== null) {
                    interaction.timePeriod = String(timePeriod);
                }
                onUserInteractionRef.current?.(interaction);
            }

            // semantic axis titles, deep-merged so the per-chart-type xAxis
            // (type, categories, units) still applies and extraOptions can
            // still override
            const axisTitleOptions: any = {};
            if (xAxisTitleText !== undefined) {
                axisTitleOptions.xAxis = { title: { text: xAxisTitleText } };
            }
            if (yAxisTitleText !== undefined) {
                axisTitleOptions.yAxis = { title: { text: yAxisTitleText } };
            }

            // theme is the lowest precedence: per-visual colorPalette (explicit
            // series colours) and config fields override it
            setHcOptions(merge(themeChartOptions(theme), {
                plotOptions: {
                    series: {
                        events: {
                            click: function (this: any) {
                                emitInteraction('series-click', buildSeriesConcepts(this.name, interactionDimensions));
                            },
                            legendItemClick: function (this: any) {
                                emitInteraction('legend-click', buildSeriesConcepts(this.name, interactionDimensions));
                            }
                        },
                        point: {
                            events: {
                                click: function (this: any) {
                                    const row = this.options || {};
                                    emitInteraction('point-click', buildInteractionConcepts(row, interactionDimensions), this.y, row.TIME_PERIOD);
                                }
                            }
                        }
                    }
                },
                chart: {
                    type: chartType === 'drilldown' ? 'column' : chartType,
                    events: {
                        // engine-internal failures (e.g. Highcharts error #14
                        // on string data) re-surface as typed errors instead
                        // of raw console output
                        displayError: function (this: any, e: any) {
                            setRenderError(new SDMXRenderError(
                                'ERR_ENGINE',
                                `The charting engine failed while rendering visual ${config.id}${e?.code !== undefined ? ` (engine error ${e.code})` : ''}. Fix: check that observation values are numeric and that extraOptions, if set, are valid for the chart type.`,
                                { visualId: config.id, detail: { engineErrorCode: e?.code }, cause: e }
                            ))
                        }
                    }
                },
                title: {
                    useHTML: true,
                    text: `<h2 style="font-weight:inherit;font-size:inherit;font-style:inherit;">${titleText}${config.metadataLink?<Button variant="link" onClick={() => window.open(config.metadataLink, "_blank")}><InfoCircle></InfoCircle></Button>:""}</h2>`,
                    style: {
                        fontWeight: config.title?.weight? config.title.weight : "",
                        fontStyle: config.title?.style,
                        fontSize: config.title?.size,
                        color: config.title?.color
                    },
                    align: config.title?.align || "center"
                },
                subtitle: {
                    text: `<h4>${subtitleText}</h4>`,
                    style: {
                        fontWeight: config.subtitle?.weight || "",
                        fontStyle: config.subtitle?.style || "",
                        fontSize: config.subtitle?.size,
                        color: config.subtitle?.color
                    },
                    align: config.subtitle?.align || "center"
                },
                legend: {
                    enabled: config.legend?.location !== "none" ? true:false,
                    align: legendAlign
                },
                series: seriesData
            }, axisTitleOptions, hcExtraOptions || {}, config.extraOptions || {}));

            setA11yTable({
                rows: allRows,
                dimensions: interactionDimensions,
                xAxisConcept: a11yXAxisConcept,
                legendConcept: a11yLegendConcept,
                caption: titleText || config.id,
                valueHeader: config.unit?.text || 'Value',
                numberLocale
            })

            reportRenderStatus({
                visualId: config.id,
                status: 'rendered',
                stats: computeRenderStats(allRows, seriesData.length)
            })
        }).catch((error: Error) => {
            // surface every data, config, and validation failure in the
            // panel instead of leaving an eternal "Loading..." placeholder
            const renderError = toSDMXRenderError(error, config.id)
            setRenderError(renderError)
            setIsLoading(false)
            reportRenderStatus({
                visualId: config.id,
                status: renderError.code === 'ERR_EMPTY' ? 'empty' : 'error',
                error: renderError
            })
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configKey, language, fetcher, themeKey]);

    const chart: React.ReactNode =
        <HighchartsReact
            highcharts={Highcharts}
            options={hcOptions}
            ref={chartComponentRef}
            containerProps={{ ...props, className: `${props.className} ${config.frame && config.frame ? "border" : ""}`}}
            callback={callback}
        />

    if (renderError) {
        const errorCode = renderError instanceof SDMXRenderError ? renderError.code : undefined
        if (errorCode === 'ERR_EMPTY' && renderEmpty) {
            return <>{renderEmpty(config.id)}</>
        }
        if (renderErrorSlot && renderError instanceof SDMXRenderError) {
            return <>{renderErrorSlot(renderError)}</>
        }
        return (
            <div className={`sdmx-render-error alert alert-warning ${props.className || ""}`} role="alert" data-error-code={errorCode}>
                {renderError.message}
            </div>
        )
    }

    return (
        <>
            {isLoading ? (renderLoading ? renderLoading(config.id) : placeholder) || <div className="opacity-50 d-table-cell align-middle" style={{ "height": 400, "width": 600 }}>Loading...</div>
            :  config.dataLink ? <a href={ config.dataLink} target="_blank" rel="noreferrer">{chart}</a>
                : chart
            }
            {a11yTable &&
                <HiddenDataTable
                    data={a11yTable.rows}
                    dimensions={a11yTable.dimensions}
                    xAxisConcept={a11yTable.xAxisConcept}
                    legendConcept={a11yTable.legendConcept}
                    caption={a11yTable.caption}
                    valueHeader={a11yTable.valueHeader}
                    numberLocale={a11yTable.numberLocale}
                />
            }
        </>
    )
}

export default Chart;
