import React from 'react';
import Text from '../text';
import Value from '../value';
import Chart from '../chart';
import { ErrorBoundary } from 'react-error-boundary';
import MapComponent from '../map';
import { SDMXChartConfig, SDMXFetcher, SDMXMapConfig, SDMXVisualConfig, VisualRenderStatus } from '../types';
import { Map } from 'ol';

/**
 * Return div/col with component corresponding to chart type
 * 
 * @todo create component with type = VALUE
 * 
 * @param config Dashboard element configuration
 * @returns 
 */
const Cell = ({
    config,
    callback,
    language,
    className,
    fetcher,
    onVisualRender
}: {
    config: SDMXVisualConfig | SDMXChartConfig | SDMXMapConfig,
    callback?: (component: React.JSX.Element | Highcharts.Chart | Map) => void,
    language: string, className: string, fetcher?: SDMXFetcher,
    onVisualRender?: (status: VisualRenderStatus) => void }) => {

    const conditionalBoardComponent = () => {

        switch (config.type) {
            case 'bar':
            case 'column':
            case 'line':
            case 'drilldown':
            case 'lollipop':
            case 'treemap':
            case 'pie':
                return <Chart
                    config={config as SDMXChartConfig}
                    key={language}
                    callback={callback}
                    language={language}
                    fetcher={fetcher}
                    onVisualRender={onVisualRender}
                />
            case 'map':
                return <MapComponent
                    config={config as SDMXMapConfig}
                    key={language}
                    language={language}
                    callback={callback}
                    fetcher={fetcher}
                    onVisualRender={onVisualRender}
                />
            case 'value':
                return <Value
                    config={config}
                    key={language}
                    language={language}
                    callback={callback}
                    fetcher={fetcher}
                    onVisualRender={onVisualRender}
                />
            case 'note':
                return <Text
                    config={config}
                    key={language}
                    language={language}
                />
            default:
                return <p className="text-danger">[{config.type}]<br />Type does not exists.</p>
        }

    }

    const fallbackRender = ({ error }: { error: any }) => {
        return (
            <div className="text-danger">
                <p>Something went wrong:</p>
                <pre style={{ color: "red" }}>{error.message}</pre>
            </div>
        )
    }


    return (
        <ErrorBoundary
            fallbackRender={fallbackRender}
            onReset={() => { }}
        >
            <div className={`${className} bg-light`}>
                {conditionalBoardComponent()}
            </div>

        </ErrorBoundary>
    )
}

export default Cell;