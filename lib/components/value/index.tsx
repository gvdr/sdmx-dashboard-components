import React, { useEffect, useMemo, useRef, useState } from "react";
import parse from "html-react-parser";
import { parseOperandTextExpr, parseTextExpr } from '../../utils/parseTextExpr';
import { SDMXParser } from '../../utils/sdmxParser';
import { fetchDataExprOperand, parseDataExpr } from "../../utils/parseDataExpr";
import { InfoCircle } from "react-bootstrap-icons";
import { Button } from "react-bootstrap";
import { SDMXFetcher, SDMXTheme, SDMXVisualConfig, VisualRenderStatus } from "../types";
import { SDMXRenderError, toSDMXRenderError } from "../../errors";
import { computeRenderStats } from "../../utils/renderStats";
import { resolveNumberLocale } from "../../utils/theme";
import { createTransport, FetchTelemetry } from "../../utils/transport";
import { parse as parseExpr, EvalAstFactory, Scope } from "jexpr";


interface ValueProps extends React.HTMLAttributes<HTMLDivElement> {
    config: SDMXVisualConfig;
    valueClassName?: string;
    placeholder?: React.JSX.Element;
    callback?: (value: React.JSX.Element) => void;
    language: string;
    fetcher?: SDMXFetcher;
    onVisualRender?: (status: VisualRenderStatus) => void;
    onDataFetch?: (telemetry: FetchTelemetry) => void;
    renderLoading?: (visualId: string) => React.ReactNode;
    renderEmpty?: (visualId: string) => React.ReactNode;
    renderError?: (error: SDMXRenderError) => React.ReactNode;
    theme?: SDMXTheme;
}

const Value = ({ config, placeholder, callback, language, fetcher, onVisualRender, onDataFetch, renderLoading, renderEmpty, renderError: renderErrorSlot, theme, ...props }: ValueProps) => {

    const numberLocale = resolveNumberLocale(theme, language);

    const [valueElement, setValueElement] = useState(<span>Loading...</span>)
    const [popupStr, setPopupStr] = useState<string>("")
    const [titleText, setTitleText] = useState<string>(config.title?'Loading...':'')
    const [subtitleText, setSubtitleText] = useState<string>(config.subtitle?'Loading...':'')
    const [isLoading, setIsLoading] = useState(true)
    const [renderError, setRenderError] = useState<SDMXRenderError | null>(null)

    const sdmxParser = new SDMXParser();
    const containerRef = useRef<HTMLDivElement>(null);

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
    // key effects on config content, not object identity, so inline config
    // literals do not cause re-fetch loops (see chart for the rationale)
    const configKey = JSON.stringify(config);
    // dedup, cache, and retry per rendered config; a dashboard-provided
    // transport passes through unchanged so visuals share its cache
    const transport = useMemo(
        () => createTransport(fetcher, (telemetry) => onDataFetchRef.current?.(telemetry)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [configKey, language, fetcher]
    );

    // className is applied to container div
    // style is applied to value div
    // style main contain width, height, color and backgroundColor
    // other props are applied to container div
    let { className, style, valueClassName, ...otherProps } = props;

    let containerClass = props.className || '';
    let containerStyle = {};
    let valueStyle = style;

    // is adtaptive text size requested ?
    // check from config and from classname "adaptive-text"
    if (config.adaptiveTextSize || containerClass.indexOf("adaptive-text-size") > -1) {
        config.adaptiveTextSize = true;
    }

    // create valueDivWidth variable as a string or number, and store the width of the value div
    // this will be either a percentage or a number of pixels
    // percentage: width is a percentage of the container div
    // number: width is fixed in pixels
    let valueDivWidth: string | number = '100%';

    // if no className and no style are provided, set default style
    if (!containerClass) {
        // container div default className
        containerClass = 'pt-3 pb-2 px-2 px-xl-3 bg-white h-100';
        // container default style
        containerStyle = { minHeight: '400px', width: '100%' };
    }
    if (!props.style) {
        // value div default style
        valueStyle = { height: '100%', width: '100%' };
    } else if (props.style && props.style.width) {
        if (typeof props.style.width === 'number') {
            // number provided: width is in pixels
            valueDivWidth = props.style.width;
        } else if (typeof props.style.width === 'string') {
            if (props.style.width.endsWith('px')) {
                // string provided ending with 'px': width is in pixels
                valueDivWidth = parseInt(props.style.width);
            } else if (props.style.width.endsWith('%')) {
                // a percentage value
                // note: if 'em' or 'rem' is used, the value will be ignored
                valueDivWidth = props.style.width;
            }
        }
    }

    const calculateFontSize = (text: string) => {
        if (typeof valueDivWidth === 'number') {
            return Math.min(valueDivWidth / text.length, valueDivWidth / 2) + 'px';
        }
        if (containerRef.current) {
            // calculate the width of the value div in pixel, as a percentage of the container div
            let containerWidth = containerRef.current.clientWidth * parseInt(valueDivWidth) / 100;
            // Adjust the formula as needed to fit your design
            return Math.min(containerWidth / text.length, containerWidth / 2) + 'px';
        }
        // default value if no container found
        return '4em';
    };

    const formatValue = (valueStr: any, config: any, data: any, attributes: any, language: string, numberLocale: string) => {
        if (config['decimals']) {
            const decimalNumber = Number(parseOperandTextExpr(config['decimals'], data[0], attributes));
            valueStr = Number(valueStr).toFixed(decimalNumber);
        }
        let valueLabel = '';
        let valueUnder = false;
        if (config.unit) {
            // if config.unit[text] is string, just use it as is, otherwise use the language version
            if (typeof config.unit['text'] === 'string') {
                valueLabel = config.unit['text'];
            } else {
                valueLabel = config.unit['text'][language];
            }
            // position the unit label
            if (config.unit['location'] === 'suffix') {
                valueStr += ' '+valueLabel;
            } else if (config.unit['location'] === 'prefix') {
                valueStr = valueLabel+' '+valueStr;
            } else if (config.unit['location'] === 'under') {
                valueUnder = true;
            }
        }
        const valueSize = config.adaptiveTextSize ? calculateFontSize(valueStr.toLocaleString(numberLocale)) : '4em';
        const unitSize = ( config.adaptiveTextSize && valueUnder ) ? calculateFontSize(valueLabel) : '4em';
        return (
            <>
            <span className="lh-1" style={{fontSize: valueSize, cursor: "default"}}>{valueStr.toLocaleString(numberLocale)}</span>
            {
                valueUnder && <span style={{fontSize: unitSize, cursor: "default"}}>{valueLabel}</span>
            }
            </>
        )
    }

    useEffect(() => {
        setRenderError(null)
        reportRenderStatus({ visualId: config.id, status: 'loading' })
        const dataObjs = parseDataExpr(config.data);
        if (dataObjs.length > 1) {
            throw new Error('Multiple data expressions are not supported for Value component');
        }
        const dataObj = dataObjs[0];
        dataObj.index = dataObj.index || 0;
 
        const dataFlowUrl = dataObj.dataFlowUrl;
        sdmxParser.getDatasets(dataFlowUrl, {
            headers: new Headers({
                // no SDMX Accept header: format=jsondata selects the dialect;
                // a v2.0 Accept header makes ECB 406 (see §5 of the doc)
                "Accept-Language": language
            }),
            fetcher: transport
        }).then(() => {
            const data = sdmxParser.getData();
            if (data.length === 0) {
                throw new SDMXRenderError(
                    'ERR_EMPTY',
                    `The data query for visual ${config.id} returned zero observations. Fix: widen the data query (e.g. broaden the filter or the period) or check that the dataflow contains data for the requested slice.`,
                    { detail: { url: dataFlowUrl } }
                );
            }
            const dimensions = sdmxParser.getDimensions();
            const attributes = sdmxParser.getAttributes();

            if(config.title) {
                if(typeof config.title == 'string') {
                    setTitleText(parseTextExpr(config.title, dimensions))
                } else {
                    setTitleText(typeof config.title.text == 'string'? parseTextExpr(config.title.text, dimensions) : parseTextExpr(config.title.text[language], dimensions))
                }
            }
            if(config.subtitle) {
                if(typeof config.subtitle == 'string') {
                    setSubtitleText(parseTextExpr(config.subtitle, dimensions))
                } else {
                    setSubtitleText(typeof config.subtitle.text == 'string'? parseTextExpr(config.subtitle.text, dimensions) : parseTextExpr(config.subtitle.text[language], dimensions))
                }
            }

            let valueStr = data[0].value;
            // apply operation to data
            if (dataObj.operator) {
                if(dataObj.operator === "count") {
                    const countData = data
                        .map((item: any) => {
                            const expr = parseExpr(`x0 ${dataObj.exprOperator} x1`, new EvalAstFactory());
                            const scope: Scope = {x0: item.value}
                            if (isNaN(parseInt(dataObj.exprOperand))) {
                                const dataPromises = fetchDataExprOperand([dataObj.exprOperand], data, scope, attributes, language, transport)
                                Promise.all(dataPromises).then(() => {
                                    Object.keys(scope).forEach((key: string) => {
                                        if (Array.isArray(scope[key])) {
                                            scope[key] = scope[key][0]
                                        }
                                    })
                                    valueStr = expr?.evaluate(scope)
                                    return valueStr && item;
                                })
                            } else {
                                scope['x1'] = parseInt(dataObj.exprOperand)
                                valueStr = expr?.evaluate(scope)
                                return valueStr && item;
                            }
                        })
                        .filter((item: any) => item); // count number of true
                    setValueElement(formatValue(countData.length, config, countData, attributes, language, numberLocale));
                    setPopupStr(countData.map((item: any) => item[config.xAxisConcept]).join(', '))
                } else if (dataObj.operator === "expr") {
                    const scope: Scope = {x0: valueStr}
                    const dataPromises = fetchDataExprOperand(dataObj.exprOperand, data, scope, attributes, language, transport)
                    Promise.all(dataPromises).then(() => {
                        const astFactory = new EvalAstFactory();
                        const expr = parseExpr(dataObj.expression, astFactory);
                        // fetchDataExprOperand returns an array for variables, so we need to flatten it
                        Object.keys(scope).forEach((key: string) => {
                            if (Array.isArray(scope[key])) {
                                scope[key] = scope[key][0]
                            }
                        })
                        valueStr = expr?.evaluate(scope)
                        setValueElement(formatValue(valueStr, config, data, attributes, language, numberLocale));
                        setPopupStr(data[0][config.xAxisConcept])
                    })
                }
            } else {
                setValueElement(formatValue(valueStr, config, data, attributes, language, numberLocale));
                setPopupStr(data[0][config.xAxisConcept])
            }
            
            setIsLoading(false)
            reportRenderStatus({
                visualId: config.id,
                status: 'rendered',
                stats: computeRenderStats(data, 1)
            })
            if(callback) {
                callback(valueElement)
            }
        }).catch((error: Error) => {
            const valueError = toSDMXRenderError(error, config.id)
            setRenderError(valueError)
            setIsLoading(false)
            reportRenderStatus({
                visualId: config.id,
                status: valueError.code === 'ERR_EMPTY' ? 'empty' : 'error',
                error: valueError
            })
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [configKey, language, fetcher]);

    const valueNode: React.ReactNode =
        <div className="value-node d-flex flex-column h-100">
            {config.title &&
                <h2
                    className={`${config.title.weight?"fw-"+config.title.weight:""} ${ config.title.style?'fst-'+config.title.style:''} ${config.title.align === "left"? "text-start": config.title.align === "right"?"text-end": config.title.align === "center"?"text-center":""}`}
                    style={{
                        fontSize: config.title.size,
                        color: config.title?.color
                    }}>
                    {titleText}
                    {config.metadataLink &&
                        <Button variant="link" onClick={() => {window.open(config.metadataLink, "_blank")}}>
                            <InfoCircle/>
                        </Button>
                    }
                </h2>
            }
            {config.subtitle &&
                <h4
                    className={`${config.subtitle.weight?"fw-"+config.subtitle.weight:""} ${config.subtitle.style?'fst-'+config.title?.style:''}`}
                    style={{
                        fontSize: config.subtitle.size,
                        textAlign: config.subtitle?.align
                    }}>
                    {parse(subtitleText)}
                </h4>
            }
            <div
                className={`${valueClassName || ''} flex-grow-1 d-flex flex-column align-items-center justify-content-center`}
                style={valueStyle}
                title={popupStr}>
                {valueElement}
            </div>
        </div>

    if (renderError) {
        if (renderError.code === 'ERR_EMPTY' && renderEmpty) {
            return <>{renderEmpty(config.id)}</>
        }
        if (renderErrorSlot) {
            return <>{renderErrorSlot(renderError)}</>
        }
        return (
            <div className={`sdmx-render-error alert alert-warning ${containerClass || ""}`} role="alert" data-error-code={renderError.code}>
                {renderError.message}
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className={`${containerClass || ''} ${config.frame ? "border" : ""}`}
            style={containerStyle}
            {...otherProps}>
            { isLoading ? (renderLoading ? renderLoading(config.id) : placeholder) || <div className="opacity-50 d-flex align-items-center justify-content-center h-100 w-100"><span>Loading...</span></div>
            :   config.dataLink ? <a href={config.dataLink} target="_blank">{valueNode}</a> :
                valueNode
            }
        </div>
    )
}
export default Value;