export type SDMXRenderErrorCode =
    | "ERR_NO_SERIES_DIMENSION" // chart type needs a grouping dimension but only the x-axis varies
    | "ERR_AMBIGUOUS_SERIES"; // two or more non-x-axis dimensions vary and no legend.concept disambiguates

/**
 * Typed error for failures detected while preparing a visual for rendering.
 * The message is part of the public contract: consumers (including AI agents
 * driving the library) read it to correct their dashboard config, so tests
 * assert on its content.
 */
export class SDMXRenderError extends Error {
    code: SDMXRenderErrorCode;
    detail?: Record<string, unknown>;

    constructor(code: SDMXRenderErrorCode, message: string, detail?: Record<string, unknown>) {
        super(message);
        this.name = "SDMXRenderError";
        this.code = code;
        this.detail = detail;
    }
}
