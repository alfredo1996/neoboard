/**
 * Typed error thrown by dashboard save mutations so the catch site can
 * classify by HTTP status without parsing the message.
 */
export class SaveError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SaveError";
    this.status = status;
  }
}

export interface ClassifiedError {
  title: string;
  description: string;
}

/**
 * Map a save failure to a user-facing toast title/description.
 * Falls back to a generic message when the error shape is unknown.
 */
export function classifySaveError(err: unknown): ClassifiedError {
  if (err instanceof SaveError) {
    if (err.status === 401 || err.status === 403) {
      return {
        title: "Save failed",
        description: "You don't have permission to update this dashboard.",
      };
    }
    if (err.status === 404) {
      return {
        title: "Save failed",
        description: "This dashboard may have been deleted.",
      };
    }
    if (err.status === 409) {
      return {
        title: "Save conflict",
        description: "Another change was saved first — please reload.",
      };
    }
    if (err.status >= 500) {
      return {
        title: "Save failed",
        description: "Server error — your change wasn't saved.",
      };
    }
    return { title: "Save failed", description: err.message };
  }

  if (err instanceof Error) {
    return {
      title: "Save failed",
      description: "Couldn't reach the server — your change wasn't saved.",
    };
  }

  return {
    title: "Save failed",
    description: "Something went wrong — your change wasn't saved.",
  };
}
