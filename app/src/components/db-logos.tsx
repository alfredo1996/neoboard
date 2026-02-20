import type { SVGProps } from "react";

/**
 * Simplified Neo4j brand logo (graph-node motif, official blue/green palette).
 */
export function Neo4jLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Neo4j"
      {...props}
    >
      {/* top node */}
      <circle cx="32" cy="10" r="8" fill="#018BFF" />
      {/* bottom-left node */}
      <circle cx="10" cy="52" r="8" fill="#00BF82" />
      {/* bottom-right node */}
      <circle cx="54" cy="52" r="8" fill="#00BF82" />
      {/* edges */}
      <line x1="32" y1="18" x2="10" y2="44" stroke="#00BF82" strokeWidth="3" strokeLinecap="round" />
      <line x1="32" y1="18" x2="54" y2="44" stroke="#00BF82" strokeWidth="3" strokeLinecap="round" />
      <line x1="18" y1="52" x2="46" y2="52" stroke="#018BFF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Simplified PostgreSQL brand logo (elephant silhouette, official blue palette).
 */
export function PostgreSQLLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="PostgreSQL"
      {...props}
    >
      {/* body */}
      <ellipse cx="30" cy="38" rx="16" ry="14" fill="#336791" />
      {/* head */}
      <ellipse cx="30" cy="22" rx="13" ry="11" fill="#336791" />
      {/* ear / tusk curve */}
      <ellipse cx="43" cy="17" rx="5" ry="8" fill="#336791" />
      <ellipse cx="43" cy="17" rx="3" ry="5" fill="#5a8db5" />
      {/* trunk */}
      <path
        d="M43 25 Q50 30 47 40"
        stroke="#336791"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* eyes */}
      <circle cx="25" cy="19" r="2" fill="white" />
      <circle cx="35" cy="19" r="2" fill="white" />
      <circle cx="25.5" cy="19.5" r="1" fill="#222" />
      <circle cx="35.5" cy="19.5" r="1" fill="#222" />
      {/* legs */}
      <rect x="18" y="50" width="6" height="8" rx="3" fill="#336791" />
      <rect x="28" y="50" width="6" height="8" rx="3" fill="#336791" />
    </svg>
  );
}
