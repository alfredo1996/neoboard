/**
 * Typed error thrown by `triggerExport` so the catch site can classify by
 * HTTP status without parsing the message.
 */
export class ExportError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ExportError";
    this.status = status;
  }
}

export interface ClassifiedError {
  title: string;
  description: string;
}

/**
 * Map an export failure to a user-facing toast title/description.
 * Falls back to a generic message when the error shape is unknown.
 */
export function classifyExportError(err: unknown): ClassifiedError {
  if (err instanceof ExportError) {
    if (err.status === 401 || err.status === 403) {
      return {
        title: "Permission denied",
        description: "You don't have permission to export this dashboard.",
      };
    }
    if (err.status === 404) {
      return {
        title: "Dashboard not found",
        description: "This dashboard may have been deleted.",
      };
    }
    if (err.status >= 500) {
      return {
        title: "Export failed",
        description: "Server error — please try again.",
      };
    }
    return { title: "Export failed", description: err.message };
  }

  if (err instanceof Error) {
    return {
      title: "Export failed",
      description: "Couldn't reach the server.",
    };
  }

  return { title: "Export failed", description: "Something went wrong." };
}
