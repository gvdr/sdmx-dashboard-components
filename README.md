# SDMX Dashboard React Component

Embeddable React components to create a dashboard for SDMX data.
The components are built using [Vite](https://vitejs.dev/).

This repository also embeds a demo application to showcase the components (more info [here](#development)).

<sub>Project generated thanks to this great article: [Create a Component Library Fast🚀\(using Vite's library mode\)](https://dev.to/receter/how-to-create-a-react-component-library-using-vites-library-mode-4lma)</sub>

## Usage

This library provides a set of components to build visuals for SDMX data.
Single React components are available `SDMXChart`, `SDMXMap` and `SDMXValue` to embed SDMX visuals in your application and can also be combined in a
 `SDMXDashboard` component that generates a dashboard.
The single components are only configured via props, while the dashboard component can configured via a JSON configuration file.

More information on the syntax of the configuration can be found [here](https://github.com/PacificCommunity/sdmx-dashboard-demo/blob/main/public/doc.md)

```bash
npm install sdmx-dashboard-components
```

```javascript
import { SDMXDashboard } from 'sdmx-dashboard-components';

const App = () => {
  return (
    // SDMX dashboard component build from JSON configuration file
    <SDMXDashboard
      url='path/to/dashboard.json'
    />
    // SDMX chart component built from props
    <SDMXChart
      config={{
        data: ["https://stats-sdmx-disseminate.pacificdata.org/rest/data/SPC,DF_WBWGI,1.0/A..VA_EST?startPeriod=2010&dimensionAtObservation=AllDimensions"],
        title: {
          text: "World Bank Worldwide Governance Indicator",
        },
        subtitle: {
          text: "Voice and Accountability"
        },
        id:"wgi_va",
        type: "drilldown",
        xAxisConcept: "GEO_PICT",
        drilldown: {
          xAxisConcept:"TIME_PERIOD",
        },
        legend: {
          concept: "INDICATOR"
        },
        yAxisConcept: "OBS_VALUE"
      }}
      language='en'
    />
  );
};
```

### Error contract

Every failure in a visual's data pipeline is surfaced as an `SDMXRenderError`, rendered in place of the visual with `role="alert"` and a `data-error-code` attribute. The class and its code type are exported from the package root:

```typescript
import { SDMXRenderError, SDMXRenderErrorCode } from 'sdmx-dashboard-components';
```

| Code | Meaning |
|---|---|
| `ERR_FETCH` | data URL unreachable or non-2xx |
| `ERR_PARSE` | response is not parseable SDMX-JSON |
| `ERR_EMPTY` | query returned zero observations |
| `ERR_NO_SERIES_DIMENSION` | bar/column/lollipop chart with no varying dimension besides the x-axis |
| `ERR_AMBIGUOUS_SERIES` | two or more varying dimensions and no `legend.concept` to disambiguate |
| `ERR_CONCEPT_NOT_FOUND` | `xAxisConcept` or `legend.concept` missing from the dataflow structure |
| `ERR_ENGINE` | anything escaping the charting engine (original error kept as `cause`) |

Errors carry `visualId` (the `id` of the failing visual) and, where useful, a structured `detail` object (for `ERR_CONCEPT_NOT_FOUND` it lists the available concepts; for the series-structure codes it lists the varying dimensions with their value counts). The message wording is part of the public contract and is covered by unit tests: messages name the failing concepts and state concrete fixes, so an agent or a helpful UI can correct the configuration in one step.

### Render lifecycle

Consumers that need to know when a dashboard is ready (live previews, PDF export, agent feedback loops) can observe render state instead of polling the DOM:

```typescript
<SDMXDashboard
  config={config}
  lang="en"
  onVisualRender={(s: VisualRenderStatus) => void}      // fires per visual, on every state change
  onRenderComplete={(all: VisualRenderStatus[]) => void} // fires once per config when no visual is loading
/>
```

Each `VisualRenderStatus` carries the `visualId`, a `status` of `loading`, `rendered`, `empty`, or `error`, the `SDMXRenderError` when failed, and on success a `stats` block (`observationCount`, `seriesCount`, `timePeriodRange`) that lets a consumer judge whether a technically successful render is substantively thin. `onRenderComplete` fires exactly once per config change, after the last visual settles, including the case where every visual fails. The standalone `SDMXChart`, `SDMXValue`, and `SDMXMap` accept `onVisualRender` as well. Both callbacks are optional.

### Custom loading, empty, and error states

The built-in loading, empty, and error presentations can be replaced per state with render slots, on the dashboard and on the standalone components:

```typescript
<SDMXDashboard
  config={config}
  renderLoading={(visualId) => <BrandedSpinner />}
  renderEmpty={(visualId) => <BrandedNoDataCard />}
  renderError={(e: SDMXRenderError) => <BrandedErrorCard code={e.code} message={e.message} />}
/>
```

Defaults reproduce the built-in behaviour. `renderEmpty` applies when a query returns zero observations (`ERR_EMPTY`); other failures go to `renderError`. The map has no loading presentation of its own, so it uses only `renderEmpty` and `renderError`.

### Custom data transport

All components accept an optional `fetcher` prop with the signature of the global `fetch` (`(url, init?) => Promise<Response>`). When provided, every request made by the library (the dashboard configuration and all SDMX data queries) goes through it, so the integrating application can add authentication headers, route requests through a proxy, or apply caching and retries without touching the global `fetch`. When absent, the global `fetch` is used.

```javascript
const proxyFetcher = (url, init) =>
  fetch(url.replace('https://stats-sdmx-disseminate.pacificdata.org', '/api/sdmx-proxy'), init);

<SDMXDashboard url='path/to/dashboard.json' fetcher={proxyFetcher} />
```

Routing the SDMX data queries through the fetcher requires an sdmx-json-parser version whose `getDatasets` accepts the `fetcher` option; on older parser versions the data queries fall back to the global `fetch`. The GeoJSON layers of `SDMXMap` are loaded by OpenLayers and do not go through the fetcher.

### Highcharts Styled Mode

The user can also make use of all the Highcharts options passing them as props to the components with the `extraOptions` parameter of the config object.

For instance, the Highcharts `styledMode` option can be used to apply CSS styles to the chart's elements and also leverage the dark theme. In this case, the `colorPalette` parameter passed to the component must be an object that specify a colorIndex and not a color code. The integrating application has to include in its CSS the highcharts classes for the indexes. 

```javascript
<SDMXChart
  config={{
    data: ["https://stats-sdmx-disseminate.pacificdata.org/rest/data/SPC,DF_WBWGI,1.0/A..VA_EST?startPeriod=2010&dimensionAtObservation=AllDimensions"],
    title: {
      text: "World Bank Worldwide Governance Indicator",
    },
    colorPalette: {
      "GEO_PICT": {
        "CK": 0,
        "FJ": 1,
        "FM": 2,
        "KI": 3,
        "MH": 4,
        "NC": 5,
        "PF": 8,
        "PW": 10,
        "SB": 11,
        "TO": 12,
        "VU": 14,
        "WF": 15
      }
    },
    extraOptions: {
      chart: {
        styledMode: true
      }
    }
  }}
/>
```

```css
.highcharts-color-0 {
  fill: #E16A86;
  stroke: #E16A86;
}
.highcharts-color-1 {
  fill: #D7765B;
  stroke: #D7765B;
}
.highcharts-color-2 {
  fill: #C7821C;
  stroke: #C7821C;
}
...
```

### Sorting data by value

For `column`-like representation (`column`, `bar`, `drilldown`, `lollipop`), the data is sorted alphabetically by default. The data can be sorted by value with the `sortByValue` config parameter in ascending or descending order. The sorting is done on the x-axis dimension.

```javascript
<SDMXChart
  config={{
    ...
    sortByValue: "asc" | "desc"
    ...
  }}
/>
```

## Development

```bash
npm install
npm run dev
```

The components are located in the `lib` folder where as the `src` folder hosts a demo application.

The vite preview mode can also be used to test the built library in the demo application.

```bash
npm run preview
```

To deploy the demo app under a subfolder only in production, set `VITE_DEMO_BASE_PATH`.

```bash
# Example: deploy demo to /sdmx-dashboard-components/
VITE_DEMO_BASE_PATH=sdmx-dashboard-components npm run build-preview
```

When `VITE_DEMO_BASE_PATH` is empty (default), the demo is built for root (`/`).


## Build

```bash
npm run build
```

