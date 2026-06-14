"use client"

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SDMXParser } from "../../utils/sdmxParser";
import { parseDataExpr } from "../../utils/parseDataExpr";
import { parseTextExpr } from "../../utils/parseTextExpr";
import { SDMXFetcher, SDMXTableConfig, SDMXTheme, VisualRenderStatus } from "../types";
import { SDMXRenderError, toSDMXRenderError } from "../../errors";
import { computeRenderStats } from "../../utils/renderStats";
import { createTransport, FetchTelemetry } from "../../utils/transport";
import { pivotTable, PivotTable, SINGLE_VALUE_COLUMN } from "../../utils/pivotTable";
import { resolveNumberLocale } from "../../utils/theme";

interface TableProps extends React.HTMLAttributes<HTMLDivElement> {
    config: SDMXTableConfig;
    language: string;
    placeholder?: React.JSX.Element;
    fetcher?: SDMXFetcher;
    onVisualRender?: (status: VisualRenderStatus) => void;
    onDataFetch?: (telemetry: FetchTelemetry) => void;
    renderLoading?: (visualId: string) => React.ReactNode;
    renderEmpty?: (visualId: string) => React.ReactNode;
    renderError?: (error: SDMXRenderError) => React.ReactNode;
    theme?: SDMXTheme;
}

const Table = ({ config, language, placeholder, fetcher, onVisualRender, onDataFetch, renderLoading, renderEmpty, renderError: renderErrorSlot, theme, ...props }: TableProps) => {

    const numberLocale = resolveNumberLocale(theme, language);

    const [isLoading, setIsLoading] = useState(true)
    const [renderError, setRenderError] = useState<SDMXRenderError | null>(null)
    const [pivot, setPivot] = useState<PivotTable | null>(null)
    const [titleText, setTitleText] = useState<string>(config.title ? 'Loading...' : '')
    const [subtitleText, setSubtitleText] = useState<string>(config.subtitle ? 'Loading...' : '')

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
    const transport = useMemo(
        () => createTransport(fetcher, (telemetry) => onDataFetchRef.current?.(telemetry)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [config, language, fetcher]
    );

    useEffect(() => {
        setRenderError(null)
        reportRenderStatus({ visualId: config.id, status: 'loading' })

        const dataObjs = parseDataExpr(config.data);
        const dataObj = dataObjs[0];
        const parser = new SDMXParser();
        parser.getDatasets(dataObj.dataFlowUrl, {
            headers: new Headers({
                Accept: "application/vnd.sdmx.data+json;version=2.0.0",
                "Accept-Language": language
            }),
            fetcher: transport
        }).then(() => {
            const data = parser.getData();
            if (data.length === 0) {
                throw new SDMXRenderError(
                    'ERR_EMPTY',
                    `The data query for visual ${config.id} returned zero observations. Fix: widen the data query (e.g. broaden the filter or the period) or check that the dataflow contains data for the requested slice.`,
                    { detail: { url: dataObj.dataFlowUrl } }
                );
            }
            const dimensions = parser.getDimensions();

            if (config.xAxisConcept && config.xAxisConcept !== 'MULTI') {
                const available = dimensions.map((dimension: any) => dimension.id);
                if (!dimensions.find((dimension: any) => dimension.id === config.xAxisConcept)) {
                    throw new SDMXRenderError(
                        'ERR_CONCEPT_NOT_FOUND',
                        `xAxisConcept ${config.xAxisConcept} not found in the dataflow. Available concepts: ${available.join(', ')}. Fix: set xAxisConcept to one of the available concepts.`,
                        { detail: { concept: config.xAxisConcept, role: 'xAxisConcept', available } }
                    );
                }
                if (config.legend?.concept && config.legend.concept !== 'MULTI' && !dimensions.find((dimension: any) => dimension.id === config.legend?.concept)) {
                    throw new SDMXRenderError(
                        'ERR_CONCEPT_NOT_FOUND',
                        `legendConcept ${config.legend.concept} not found in the dataflow. Available concepts: ${available.join(', ')}. Fix: set legend.concept to one of the available concepts.`,
                        { detail: { concept: config.legend.concept, role: 'legend.concept', available } }
                    );
                }
            }

            if (typeof config.title === 'string') {
                setTitleText(parseTextExpr(config.title, dimensions))
            } else if (typeof config.title === 'object') {
                setTitleText(typeof config.title.text === 'string' ? parseTextExpr(config.title.text, dimensions) : parseTextExpr(config.title.text[language], dimensions))
            }
            if (typeof config.subtitle === 'string') {
                setSubtitleText(parseTextExpr(config.subtitle, dimensions))
            } else if (typeof config.subtitle === 'object') {
                setSubtitleText(typeof config.subtitle.text === 'string' ? parseTextExpr(config.subtitle.text, dimensions) : parseTextExpr(config.subtitle.text[language], dimensions))
            }

            const built = pivotTable(data, config.xAxisConcept, config.legend?.concept, dimensions);
            setPivot(built)
            setIsLoading(false)
            reportRenderStatus({
                visualId: config.id,
                status: 'rendered',
                stats: computeRenderStats(data, built.columnKeys.length)
            })
        }).catch((error: Error) => {
            const tableError = toSDMXRenderError(error, config.id)
            setRenderError(tableError)
            setIsLoading(false)
            reportRenderStatus({
                visualId: config.id,
                status: tableError.code === 'ERR_EMPTY' ? 'empty' : 'error',
                error: tableError
            })
        });
    }, [config, language, transport]);

    if (renderError) {
        if (renderError.code === 'ERR_EMPTY' && renderEmpty) {
            return <>{renderEmpty(config.id)}</>
        }
        if (renderErrorSlot) {
            return <>{renderErrorSlot(renderError)}</>
        }
        return (
            <div className={`sdmx-render-error alert alert-warning ${props.className || ""}`} role="alert" data-error-code={renderError.code}>
                {renderError.message}
            </div>
        )
    }

    if (isLoading || !pivot) {
        return (
            <>
                {(renderLoading ? renderLoading(config.id) : placeholder) || <div className="opacity-50 d-flex align-items-center justify-content-center h-100 w-100"><span>Loading...</span></div>}
            </>
        )
    }

    const showColumnHeaders = pivot.columnKeys.length > 0 && pivot.columnKeys[0] !== SINGLE_VALUE_COLUMN;
    const valueHeader = config.unit?.text || 'Value';
    const formatValue = (value: number | undefined) => {
        if (value === undefined || value === null) {
            return '';
        }
        return value.toLocaleString(numberLocale);
    }

    return (
        <div className={`sdmx-table ${props.className || ''} ${config.frame ? "border" : ""}`}>
            {config.title && <h2 className="text-center">{titleText}</h2>}
            {config.subtitle && <h4 className="text-center">{subtitleText}</h4>}
            <table className="table">
                <caption className="visually-hidden">{titleText || config.id}</caption>
                <thead>
                    <tr>
                        <th scope="col">{config.xAxisConcept}</th>
                        {showColumnHeaders
                            ? pivot.columnKeys.map((columnKey) => <th key={columnKey} scope="col">{columnKey}</th>)
                            : <th scope="col">{valueHeader}</th>
                        }
                    </tr>
                </thead>
                <tbody>
                    {pivot.rowKeys.map((rowKey) => (
                        <tr key={rowKey}>
                            <th scope="row">{rowKey}</th>
                            {pivot.columnKeys.map((columnKey) => (
                                <td key={columnKey}>{formatValue(pivot.cells[rowKey][columnKey])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default Table;
