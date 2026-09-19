import {
  Database,
  FileText,
  Globe,
  Plug,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import type { ConnectorDescriptor } from "@neoboard/connection";

/** The glyph for a connector that ships no icon — by category, never by connector. */
const CATEGORY_ICONS: Record<ConnectorDescriptor["category"], LucideIcon> = {
  database: Database,
  graph: Waypoints,
  api: Globe,
  file: FileText,
};

interface ConnectorIconProps {
  /** `undefined`: a connector that is not installed, or not loaded yet. */
  readonly connector:
    Pick<ConnectorDescriptor, "category" | "iconSvg"> | undefined;
  /** Size and placement are the app's; the connector only supplies the drawing. */
  readonly className?: string;
}

/**
 * A connector's icon (#1899). `iconSvg` comes from a connector package — code
 * we did not write — so it is ONLY ever rendered as an image: inside an
 * `<img>` an SVG cannot run scripts, fire event handlers or load anything
 * external. It must never reach the DOM as markup.
 */
export function ConnectorIcon({ connector, className }: ConnectorIconProps) {
  if (connector?.iconSvg) {
    return (
      // Not next/image: it cannot optimise a data URI, and <img> is the sandbox.
      <img
        src={"data:image/svg+xml;utf8," + encodeURIComponent(connector.iconSvg)}
        alt=""
        className={className}
      />
    );
  }
  // `?? Plug` also covers a category this build has never heard of: the
  // descriptor arrives over HTTP, so its type is a promise, not a guarantee.
  const Glyph = (connector && CATEGORY_ICONS[connector.category]) ?? Plug;
  return <Glyph aria-hidden className={className} />;
}
