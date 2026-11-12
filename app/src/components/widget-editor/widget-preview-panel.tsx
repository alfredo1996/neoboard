"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { CardBackground } from "@neoboard/components/card-background";
import { AlertCircle, CircleStop, Play, Square } from "lucide-react";
import { CardContainer } from "../card-container";
import { ParameterPreview } from "./parameter-preview";
import { mapPreviewError } from "@/lib/query/preview-error";
import { isRunDisabled } from "./preview-run-state";
import { markdownSettingsSchema } from "@/plugins/markdown/settings";
import { safeParseSettings } from "@/lib/plugin/safe-parse-settings";
import { PREVIEW_ROW_LIMIT } from "./use-auto-preview";
import type { ClickAction, StylingConfig } from "@/lib/db/schema";
import type { ParamUIType, DateSubType } from "@/stores/widget-editor-store";
import type { FormFieldDef } from "@/lib/widget/form-field-def";
import {
  Button,
  Label,
  WidgetCard,
  LoadingOverlay,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  MarkdownWidget,
  IframeWidget,
} from "@neoboard/components";

interface PreviewData {
  data: unknown;
  resultId: string;
  connectorType?: string;
  serverDurationMs?: number;
  schedulerWaitMs?: number;
}

type WidgetPreviewPanelProps = Readonly<{
  chartType: string;
  connectionId: string;
  query: string;
  title: string;
  /** The card's fill, already gated by the chart type (#2394). */
  cardBackground?: CardBackground;
  description?: string;
  chartOptions: Record<string, unknown>;
  colorScales: Array<{ column: string; minColor: string; maxColor: string }>;
  buildStylingConfig: () => StylingConfig | undefined;
  /** The click action as it would be saved, so the preview marks its cells (#2406). */
  buildClickAction?: () => ClickAction | undefined;

  isParamSelect: boolean;
  /** Editing a Widget Library template: no dashboard is open (#1951). */
  isLabMode?: boolean;
  isForm: boolean;
  isContentOnly: boolean;
  isMarkdown: boolean;
  isIframe: boolean;

  paramUIType: ParamUIType;
  dateSub: DateSubType;
  multiSelect: boolean;
  paramWidgetName: string;
  seedPreviewOptions: { value: string; label: string }[] | null;
  seedQueryPending: boolean;
  seedQueryError: string | null;

  formFields: FormFieldDef[];

  previewRef: RefObject<HTMLDivElement | null>;
  previewQuery: {
    isPending: boolean;
    isError: boolean;
    error: Error | null;
    data: PreviewData | undefined;
    /** Start of the current run; a new run restarts the seconds (#2445). */
    submittedAt?: number;
  };
  initialPreviewData: PreviewData | undefined;
  onRunPreview: () => void;
  /** Ends the running preview (#2445). */
  onStopPreview?: () => void;
  /** The author stopped the last run: show that, never an older result (#2445). */
  stopped?: boolean;
  /** Query references $param_x tokens that aren't all bound yet (#1055). */
  waitingForParams?: boolean;
}>;

/**
 * The loading overlay with its seconds. Its own component, keyed on the run,
 * so the tick re-renders only this and a new run starts again at 0 (#2445).
 */
function PreviewLoading() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <LoadingOverlay
      className="absolute inset-0 z-10 min-h-0 rounded-lg"
      // The overlay is a polite live region: only the words are announced,
      // not a counter that changes every second.
      text={
        <>
          Loading preview… <span aria-hidden="true">{seconds} s</span>
        </>
      }
    />
  );
}

function StoppedPreview() {
  return (
    // <output> is an implicit status region; its content model is phrasing,
    // so the two lines are block spans rather than paragraphs.
    <output className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <CircleStop
        className="h-7 w-7 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="block text-sm font-medium text-foreground-2">
        Query stopped
      </span>
      <span className="block text-xs text-muted-foreground">
        Run it again to see the preview.
      </span>
    </output>
  );
}

function renderMarkdown(chartOptions: Record<string, unknown>) {
  // The schema drops a stored value it does not know, as the dashboard does.
  const s = safeParseSettings(markdownSettingsSchema, chartOptions, "markdown");
  return (
    <MarkdownWidget
      content={s.content}
      textSize={s.textSize}
      textAlign={s.textAlign}
    />
  );
}

function renderIframe(chartOptions: Record<string, unknown>) {
  return (
    <IframeWidget
      url={chartOptions.url as string | undefined}
      title={chartOptions.iframeTitle as string | undefined}
      sandbox={chartOptions.sandbox as string | undefined}
    />
  );
}

function renderParamSelect(props: {
  paramUIType: ParamUIType;
  dateSub: DateSubType;
  multiSelect: boolean;
  paramWidgetName: string;
  chartOptions: Record<string, unknown>;
  seedPreviewOptions: { value: string; label: string }[] | null;
  seedQueryPending: boolean;
  seedQueryError: string | null;
  isLabMode?: boolean;
}) {
  return (
    <ParameterPreview
      paramUIType={props.paramUIType}
      dateSub={props.dateSub}
      multiSelect={props.multiSelect}
      paramWidgetName={props.paramWidgetName}
      chartOptions={props.chartOptions}
      seedPreviewOptions={props.seedPreviewOptions}
      seedQueryPending={props.seedQueryPending}
      seedQueryError={props.seedQueryError}
      isLabMode={props.isLabMode}
    />
  );
}

function renderForm(
  formFields: FormFieldDef[],
  chartOptions: Record<string, unknown>,
) {
  if (formFields.length > 0) {
    return (
      <div className="p-4 space-y-3 overflow-auto h-full">
        {formFields.map((f) => (
          <div key={f.id} className="space-y-1.5">
            <Label className="text-sm">{f.label || f.parameterName}</Label>
            <div className="h-8 rounded-md border bg-muted/30 flex items-center px-3 text-xs text-muted-foreground">
              {f.parameterType}
            </div>
          </div>
        ))}
        <Button disabled className="w-full mt-2">
          {(chartOptions.submitButtonText as string) || "Submit"}
        </Button>
      </div>
    );
  }
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-4 text-center">
      Add fields in the Fields section below to see the form preview
    </div>
  );
}

function renderChart(props: {
  chartType: string;
  connectionId: string;
  query: string;
  title: string;
  chartOptions: Record<string, unknown>;
  colorScales: Array<{ column: string; minColor: string; maxColor: string }>;
  buildStylingConfig: () => StylingConfig | undefined;
  buildClickAction?: () => ClickAction | undefined;
  previewQuery: WidgetPreviewPanelProps["previewQuery"];
  initialPreviewData: PreviewData | undefined;
  stopped?: boolean;
}) {
  const { previewQuery } = props;
  return (
    <>
      {previewQuery.isPending && (
        <PreviewLoading key={previewQuery.submittedAt} />
      )}
      {renderChartBody(props)}
    </>
  );
}

function renderChartBody(props: Parameters<typeof renderChart>[0]) {
  const {
    chartType,
    connectionId,
    query,
    title,
    chartOptions,
    colorScales,
    buildStylingConfig,
    buildClickAction,
    previewQuery,
    initialPreviewData,
    stopped,
  } = props;
  const waitMs = previewQuery.data?.schedulerWaitMs ?? 0;
  const queued = waitMs > 0 ? `, ${Math.round(waitMs)} queued` : "";

  if (stopped && !previewQuery.isPending) return <StoppedPreview />;
  if (previewQuery.isError && !previewQuery.data && !initialPreviewData) {
    // A write the connector flagged as blocked gets a clear message (#1043).
    const writeMsg = mapPreviewError(previewQuery.error);
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">
          {writeMsg ? "Writes not allowed" : "Query failed"}
        </p>
        <p className="text-xs max-w-xs text-center">
          {writeMsg ?? previewQuery.error?.message}
        </p>
      </div>
    );
  }
  if (previewQuery.data || initialPreviewData) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1">
          <CardContainer
            widget={{
              id: "preview",
              chartType,
              connectionId,
              query,
              settings: {
                title: title || undefined,
                chartOptions,
                stylingConfig: buildStylingConfig(),
                clickAction: buildClickAction?.(),
                conditionalFormatting: colorScales.length
                  ? { colorScales }
                  : undefined,
              },
            }}
            inertClicks
            previewData={(previewQuery.data ?? initialPreviewData)!.data}
            previewResultId={
              (previewQuery.data ?? initialPreviewData)!.resultId
            }
            previewConnectorType={
              (previewQuery.data ?? initialPreviewData)!.connectorType
            }
          />
        </div>
        {/* The preview runs at a row limit of PREVIEW_ROW_LIMIT, so its
            result is truncated by design: say so here instead of raising the
            dashboard's truncation warning, so authors don't mistake it for
            the full result (#1043, #1896). */}
        <p className="shrink-0 border-t px-2 py-1 text-[11px] text-muted-foreground">
          Preview shows up to {PREVIEW_ROW_LIMIT} rows
          {Number.isFinite(previewQuery.data?.serverDurationMs) &&
            ` · ${Math.round(previewQuery.data?.serverDurationMs ?? 0)} ms${queued}`}
        </p>
      </div>
    );
  }
  if (connectionId && query.trim() && !previewQuery.isError) {
    // Pending: the overlay above names it and carries the spinner.
    return <div className="h-full" />;
  }
  return (
    <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
      Run a query to see the preview
    </div>
  );
}

export function WidgetPreviewPanel({
  chartType,
  connectionId,
  query,
  title,
  cardBackground,
  description,
  chartOptions,
  colorScales,
  buildStylingConfig,
  buildClickAction,
  isParamSelect,
  isLabMode,
  isForm,
  isContentOnly,
  isMarkdown,
  isIframe,
  paramUIType,
  dateSub,
  multiSelect,
  paramWidgetName,
  seedPreviewOptions,
  seedQueryPending,
  seedQueryError,
  formFields,
  previewRef,
  previewQuery,
  initialPreviewData,
  onRunPreview,
  onStopPreview,
  stopped,
  waitingForParams,
}: WidgetPreviewPanelProps) {
  // Two clicks inside this window are one double-click: the second would land
  // on the flipped Run/Stop and undo the first.
  const lastToggleRef = useRef(0);
  const toggleRun = () => {
    const now = Date.now();
    if (now - lastToggleRef.current < 400) return;
    lastToggleRef.current = now;
    (previewQuery.isPending ? onStopPreview : onRunPreview)?.();
  };

  function renderPreviewContent() {
    if (isMarkdown) return renderMarkdown(chartOptions);
    if (isIframe) return renderIframe(chartOptions);
    if (isParamSelect) {
      return renderParamSelect({
        paramUIType,
        dateSub,
        multiSelect,
        paramWidgetName,
        chartOptions,
        seedPreviewOptions,
        seedQueryPending,
        seedQueryError,
        isLabMode,
      });
    }
    if (isForm) return renderForm(formFields, chartOptions);
    if (waitingForParams) {
      // Mirror the dashboard's waiting state instead of running the literal
      // $param_x token and surfacing a raw DB syntax error (#1055).
      return (
        <div className="flex h-full items-center justify-center p-6">
          <p
            className="text-sm text-muted-foreground"
            data-testid="preview-waiting-params"
          >
            Waiting for parameters…
          </p>
        </div>
      );
    }
    return renderChart({
      chartType,
      connectionId,
      query,
      title,
      chartOptions,
      colorScales,
      buildStylingConfig,
      buildClickAction,
      previewQuery,
      initialPreviewData,
      stopped,
    });
  }

  return (
    // The page ground with the widget as it will sit on the dashboard: in a
    // real card, with the title as it will read there (#2388).
    <div className="flex min-h-0 min-w-0 flex-col gap-2.5 border-l border-rule bg-page-ground px-5 py-3.5">
      <div className="flex min-h-8 items-center justify-between">
        <span className="text-caption font-medium">Preview</span>
        {!isParamSelect && !isForm && !isContentOnly && (
          <div className="flex items-center gap-2">
            {!waitingForParams && previewQuery.isError && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center text-destructive"
                    aria-label={`Query failed: ${previewQuery.error?.message}`}
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs">
                  <p className="font-medium">Query failed</p>
                  <p className="opacity-80">{previewQuery.error?.message}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Button
              variant="secondary"
              size="sm"
              // The one Run while the preview is on screen; the query toolbar
              // takes the same title only while the editor hides it (#2388).
              title={
                previewQuery.isPending
                  ? "Stop the query"
                  : "Run query (Ctrl+Enter / ⌘+Enter)"
              }
              onClick={toggleRun}
              disabled={
                !previewQuery.isPending &&
                isRunDisabled(connectionId, query, false)
              }
            >
              {previewQuery.isPending ? (
                <Square className="h-3 w-3 mr-1.5 fill-current" aria-hidden />
              ) : (
                <Play className="h-3 w-3 mr-1.5" />
              )}
              {previewQuery.isPending ? "Stop" : "Run"}
            </Button>
          </div>
        )}
      </div>

      <WidgetCard
        title={title || undefined}
        background={cardBackground}
        description={description}
        className="min-h-0 flex-1"
      >
        <div
          ref={previewRef}
          data-testid="widget-preview"
          className="relative h-full min-h-0 w-full overflow-auto"
        >
          {renderPreviewContent()}
        </div>
      </WidgetCard>
    </div>
  );
}
