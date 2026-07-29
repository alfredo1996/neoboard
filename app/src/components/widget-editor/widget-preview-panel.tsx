"use client";

import type { RefObject } from "react";
import { AlertCircle, Play } from "lucide-react";
import { CardContainer } from "../card-container";
import { ParameterPreview } from "./parameter-preview";
import { mapPreviewError } from "@/lib/query/preview-error";
import { isRunDisabled } from "./preview-run-state";
import type { StylingConfig } from "@/lib/db/schema";
import type { Transform } from "@/lib/query/data-transforms";
import type { ParamUIType, DateSubType } from "@/stores/widget-editor-store";
import type { FormFieldDef } from "@/lib/widget/form-field-def";
import {
  Button,
  Label,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  MarkdownWidget,
  IframeWidget,
} from "@neoboard/components";

interface PreviewData {
  data: unknown;
  resultId: string;
}

type WidgetPreviewPanelProps = Readonly<{
  chartType: string;
  connectionId: string;
  query: string;
  title: string;
  chartOptions: Record<string, unknown>;
  colorScales: Array<{ column: string; minColor: string; maxColor: string }>;
  transforms: Transform[];
  transformsEnabled: boolean;
  buildStylingConfig: () => StylingConfig | undefined;

  isParamSelect: boolean;
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
  };
  initialPreviewData: PreviewData | undefined;
  onRunPreview: () => void;
  /** Query references $param_x tokens that aren't all bound yet (#1055). */
  waitingForParams?: boolean;
}>;

function renderMarkdown(chartOptions: Record<string, unknown>) {
  return (
    <MarkdownWidget content={chartOptions.content as string | undefined} />
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
  transforms: Transform[];
  transformsEnabled: boolean;
  buildStylingConfig: () => StylingConfig | undefined;
  previewQuery: WidgetPreviewPanelProps["previewQuery"];
  initialPreviewData: PreviewData | undefined;
}) {
  const {
    chartType,
    connectionId,
    query,
    title,
    chartOptions,
    colorScales,
    transforms,
    transformsEnabled,
    buildStylingConfig,
    previewQuery,
    initialPreviewData,
  } = props;

  return (
    <>
      {previewQuery.isPending && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}
      {previewQuery.isError && !previewQuery.data && !initialPreviewData ? (
        (() => {
          // Map blocked-write driver errors to a clear message (#1043).
          const writeMsg = mapPreviewError(previewQuery.error?.message);
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
        })()
      ) : previewQuery.data || initialPreviewData ? (
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
                  conditionalFormatting: colorScales.length
                    ? { colorScales }
                    : undefined,
                  transforms: transforms.length ? transforms : undefined,
                  transformsEnabled,
                },
              }}
              previewData={(previewQuery.data ?? initialPreviewData)!.data}
              previewResultId={
                (previewQuery.data ?? initialPreviewData)!.resultId
              }
            />
          </div>
          {/* The preview query is capped server-side; surface the silent
              LIMIT so authors don't mistake it for the full result (#1043). */}
          <p className="shrink-0 border-t px-2 py-1 text-[11px] text-muted-foreground">
            Preview shows up to 25 rows
          </p>
        </div>
      ) : connectionId && query.trim() && !previewQuery.isError ? (
        <div className="h-full flex items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Run a query to see the preview
        </div>
      )}
    </>
  );
}

export function WidgetPreviewPanel({
  chartType,
  connectionId,
  query,
  title,
  chartOptions,
  colorScales,
  transforms,
  transformsEnabled,
  buildStylingConfig,
  isParamSelect,
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
  waitingForParams,
}: WidgetPreviewPanelProps) {
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
      transforms,
      transformsEnabled,
      buildStylingConfig,
      previewQuery,
      initialPreviewData,
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label className="mb-0">Preview</Label>
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
              variant="outline"
              size="sm"
              onClick={onRunPreview}
              disabled={isRunDisabled(
                connectionId,
                query,
                previewQuery.isPending,
              )}
            >
              {previewQuery.isPending ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent mr-1.5" />
              ) : (
                <Play className="h-3 w-3 mr-1.5" />
              )}
              Run
            </Button>
          </div>
        )}
      </div>

      <div
        ref={previewRef}
        data-testid="widget-preview"
        className="h-[500px] overflow-hidden border rounded-lg relative"
      >
        {renderPreviewContent()}
      </div>
    </div>
  );
}
