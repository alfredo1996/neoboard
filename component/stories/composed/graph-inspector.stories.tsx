import type { Meta, StoryObj } from "@storybook/react";
import {
  GraphInspector,
  type InspectorConnection,
  type InspectorElement,
} from "@/components/composed/graph-inspector";

const noop = () => undefined;

const meta = {
  title: "Composed/GraphInspector",
  component: GraphInspector,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    side: "right",
    width: 300,
    elementJson: "{}",
    onClose: noop,
    onSelectNode: noop,
    onSelectRelationship: noop,
  },
  decorators: [
    (Story) => (
      // The inspector docks inside a positioned graph; this stands in for one.
      <div className="relative h-[520px] w-[560px] overflow-hidden border bg-background">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphInspector>;

export default meta;
type Story = StoryObj<typeof meta>;

const matrix: Extract<InspectorElement, { kind: "node" }> = {
  kind: "node",
  id: "4:89d8f0b2-3c1e:603",
  databaseId: "4:89d8f0b2-3c1e:603",
  title: "The Matrix",
  color: "#2f6fdb",
  labels: ["Movie"],
  properties: [
    { key: "title", value: "The Matrix" },
    { key: "released", value: 1999 },
    { key: "budget", value: 63000000 },
    { key: "tagline", value: "Welcome to the Real World" },
  ],
};

const connections: InspectorConnection[] = [
  {
    id: "c1",
    type: "ACTED_IN",
    direction: "from",
    otherId: "p1",
    otherName: "Keanu Reeves",
  },
  {
    id: "c2",
    type: "ACTED_IN",
    direction: "from",
    otherId: "p2",
    otherName: "Carrie-Anne Moss",
  },
  {
    id: "c3",
    type: "DIRECTED",
    direction: "from",
    otherId: "p3",
    otherName: "Lana Wachowski",
  },
  {
    id: "c4",
    type: "REVIEWED",
    direction: "from",
    otherId: "p4",
    otherName: "Jessica Thompson",
  },
  {
    id: "c5",
    type: "REVIEWED",
    direction: "from",
    otherId: "p4",
    otherName: "Jessica Thompson",
  },
];

export const Node: Story = {
  args: {
    element: matrix,
    elementJson: JSON.stringify({ kind: "node", id: matrix.id }, null, 2),
    connections,
  },
};

export const Relationship: Story = {
  args: {
    element: {
      kind: "relationship",
      id: "r1",
      databaseId: "5:89d8f0b2-3c1e:17",
      title: "REVIEWED",
      source: { id: "p4", name: "Jessica Thompson" },
      target: { id: "n1", name: "The Matrix" },
      siblings: ["r1", "r2"],
      properties: [
        { key: "rating", value: 95 },
        { key: "summary", value: "Great, if a little long." },
      ],
    },
  },
};

export const MultiLabelNode: Story = {
  args: {
    element: {
      ...matrix,
      title: "Keanu Reeves",
      labels: ["Person", "Actor", "Producer", "Musician"],
    },
    connections: [],
  },
};

export const LongValuesListsAndMaps: Story = {
  args: {
    element: {
      ...matrix,
      properties: [
        {
          key: "plot",
          value: "A hacker learns the truth about reality. ".repeat(12),
        },
        {
          key: "homepage",
          value:
            "https://example.com/a/very/long/path/that/does/not/fit/beside/its/key",
        },
        {
          key: "genres",
          value: [
            "Action",
            "Sci-Fi",
            "Cyberpunk",
            "Thriller",
            "Drama",
            "Mystery",
            "Classic",
          ],
        },
        { key: "geo", value: { lat: 40.7, lon: -74, tags: ["a", "b"] } },
        { key: "empty", value: "" },
        { key: "nothing", value: null },
      ],
    },
    connections,
  },
};

export const EmptyProperties: Story = {
  args: {
    element: { ...matrix, properties: [] },
    connections: [],
  },
};

export const ClipboardBlocked: Story = {
  args: {
    element: matrix,
    elementJson: JSON.stringify(
      { kind: "node", id: matrix.id, labels: ["Movie"] },
      null,
      2,
    ),
    connections,
  },
  beforeEach: () => {
    // The Storybook browser has the clipboard; refuse the write so the box
    // shows, and give the preview document its own back afterwards.
    const own = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("blocked")) },
    });
    return () => {
      if (own) Object.defineProperty(navigator, "clipboard", own);
      else Reflect.deleteProperty(navigator, "clipboard");
    };
  },
  play: async ({ canvasElement }) => {
    const copy = canvasElement.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy node as JSON"]',
    );
    copy?.click();
  },
};

export const OnTheLeft: Story = {
  args: { element: matrix, side: "left", connections },
};

export const NodeDark: Story = { ...Node, globals: { theme: "dark" } };

export const RelationshipDark: Story = {
  ...Relationship,
  globals: { theme: "dark" },
};

/** Connections starts closed; this one opens it, and closes a type group. */
const openConnections: Story["play"] = async ({ canvasElement }) => {
  canvasElement
    .querySelector<HTMLButtonElement>('button[aria-expanded="false"]')
    ?.click();
};

export const ConnectionsOpen: Story = { ...Node, play: openConnections };

export const ConnectionsOpenDark: Story = {
  ...Node,
  play: openConnections,
  globals: { theme: "dark" },
};
