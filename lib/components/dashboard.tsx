import React from 'react';
import { useState, useEffect, useRef, useMemo } from 'react';

import Cell from './cell';
import Text from './text';

import '../global.module.css';
import { SDMXDashboardConfig, SDMXFetcher, VisualRenderStatus } from './types';
import { SDMXRenderError } from '../errors';
import { createTransport, FetchTelemetry } from '../utils/transport';

const Dashboard = ({ url, config, lang = document.documentElement.lang || "en", fetcher, onVisualRender, onRenderComplete, onDataFetch, renderLoading, renderEmpty, renderError }: {
    url?: string,
    config?: SDMXDashboardConfig,
    lang?: string,
    fetcher?: SDMXFetcher,
    onVisualRender?: (status: VisualRenderStatus) => void,
    onRenderComplete?: (all: VisualRenderStatus[]) => void,
    onDataFetch?: (telemetry: FetchTelemetry) => void,
    renderLoading?: (visualId: string) => React.ReactNode,
    renderEmpty?: (visualId: string) => React.ReactNode,
    renderError?: (error: SDMXRenderError) => React.ReactNode
}) => {

    const [pageData, setPageData] = useState<SDMXDashboardConfig>();

    const onDataFetchRef = useRef(onDataFetch);
    useEffect(() => {
        onDataFetchRef.current = onDataFetch;
    }, [onDataFetch]);
    // one transport per rendered config and language: visuals of the same
    // dashboard share identical in-flight requests and the response cache,
    // and a config or language change invalidates both
    const transport = useMemo(
        () => createTransport(fetcher, (telemetry) => onDataFetchRef.current?.(telemetry)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [pageData, lang, fetcher]
    );

    // lifecycle tracking, keyed by the rendered config and language so a new
    // config or language restarts the aggregation; initialised lazily inside
    // the handler because child effects (which report first) run before any
    // dashboard effect could reset it
    const renderTrackingRef = useRef<{
        key: { pageData: SDMXDashboardConfig, lang: string },
        statuses: { [visualId: string]: VisualRenderStatus },
        completed: boolean
    } | null>(null);

    const handleVisualRender = (status: VisualRenderStatus) => {
        onVisualRender?.(status);
        if (!pageData) {
            return;
        }
        const tracking = renderTrackingRef.current;
        if (!tracking || tracking.key.pageData !== pageData || tracking.key.lang !== lang) {
            renderTrackingRef.current = { key: { pageData, lang }, statuses: {}, completed: false };
        }
        const current = renderTrackingRef.current!;
        current.statuses[status.visualId] = status;
        if (current.completed) {
            return;
        }
        const expectedIds = pageData.rows
            .flatMap((row: any) => row.columns)
            .filter((cell: any) => cell.type !== 'note')
            .map((cell: any) => cell.id);
        const allSettled = expectedIds.length > 0 && expectedIds.every((id: string) => {
            const reported = current.statuses[id];
            return reported && reported.status !== 'loading';
        });
        if (allSettled) {
            current.completed = true;
            onRenderComplete?.(expectedIds.map((id: string) => current.statuses[id]));
        }
    }

    useEffect(() => {
      if (url) {
        (fetcher || fetch)(url).then(response => response.json()).then((data) => {
            // set default values
            if (!data.colCount) {
                data.colCount = 3;
            }
            data.rows.forEach((row: any) => {
              row.columns.forEach((cell: any) => {
                if (!cell.colSize) {
                  cell.colSize = 1;
                }
              })
            })
            setPageData(data)

        }).catch((e) => {
            console.log(e)
        })
      }
    }, [url, fetcher])

    // a dashboard without data-bearing visuals settles immediately: there are
    // no child reports to drive the aggregation
    useEffect(() => {
      if (!pageData) {
        return;
      }
      const expectedIds = pageData.rows
        .flatMap((row: any) => row.columns)
        .filter((cell: any) => cell.type !== 'note');
      if (expectedIds.length === 0) {
        onRenderComplete?.([]);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageData, lang])

    useEffect(() => {
      if(config) {
        if (!config.colCount) {
            config.colCount = 3;
        }
        config.rows.forEach((row: any) => {
          row.columns.forEach((cell: any) => {
            if (!cell.colSize) {
              cell.colSize = 1;
            }
          })
        })
        setPageData(config)
      }
    }, [config])

    return (
        <>
          { pageData && Object.keys(pageData).length !== 0 ?
            <div key={`container-${pageData.id}`} className="container-fluid mt-2">
                {
                  pageData.header ?
                    <div className="row mb-3 display-flex">
                      <Text config={pageData.header} language={lang} />
                    </div> : null
                }
                {
                  pageData.rows.map((row : any, index_row : number) => (
                    <div key={`row-${index_row}`} className="row mb-3 display-flex">
                      {
                        row.columns.map((cell: any) => (
                          <Cell key={`col-${cell.id}`} className={`col-md-${Math.ceil((12/(pageData.colCount || 3))*cell.colSize)}`} language={lang} config={cell} fetcher={transport} onVisualRender={handleVisualRender} renderLoading={renderLoading} renderEmpty={renderEmpty} renderError={renderError} />
                        ))
                      }
                    </div>
                  ))
                }
                {
                  pageData.footer ?
                    <div className="row mb-3 display-flex">
                      <Text config={pageData.footer} language={lang}/>
                    </div> : null
                }
            </div>
          : <div>Loading...</div>}
        </>
    );
}

export default Dashboard
