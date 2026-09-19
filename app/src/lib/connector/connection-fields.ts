import type { ConnectorDescriptor } from "@neoboard/connection";
import type { DynamicConnectionField } from "@neoboard/components";

/**
 * A descriptor's `group: "connection"` fields, in the shape the connection
 * form renders (#1899). The descriptor arrives from `GET /api/connectors`, so
 * a connector nobody in `app/` has heard of gets its own form.
 *
 * ponytail: `uri` renders as a plain text input and the advanced group is not
 * generated yet — #1901 replaces this with the descriptor-driven config form.
 */
export function connectionFieldsOf(
  connector: Pick<ConnectorDescriptor, "fields"> | undefined,
): DynamicConnectionField[] {
  return (connector?.fields ?? [])
    .filter((field) => field.group === "connection")
    .map(
      ({ key, label, type, required, placeholder, description, options }) => ({
        name: key,
        label,
        type: type === "uri" ? "text" : type,
        ...(required !== undefined && { required }),
        ...(placeholder !== undefined && { placeholder }),
        ...(description !== undefined && { description }),
        ...(options && { options }),
      }),
    );
}
