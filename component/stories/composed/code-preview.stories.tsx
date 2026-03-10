import type { Meta, StoryObj } from '@storybook/react';
import { CodePreview } from '@/components/composed/code-preview';

const meta = {
  title: 'Composed/CodePreview',
  component: CodePreview,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    language: {
      control: 'text',
      description: 'Language label shown in the top-right corner',
    },
    value: {
      control: 'text',
      description: 'The code/query text to display',
    },
  },
} satisfies Meta<typeof CodePreview>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Cypher: Story = {
  args: {
    value: `MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
WHERE m.released > 2000
RETURN p.name AS actor, m.title AS movie, m.released AS year
ORDER BY m.released DESC
LIMIT 25`,
    language: 'Cypher',
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};

export const SQL: Story = {
  args: {
    value: `SELECT u.name, COUNT(o.id) AS order_count
FROM users u
JOIN orders o ON o.user_id = u.id
WHERE o.created_at > NOW() - INTERVAL '30 days'
GROUP BY u.name
ORDER BY order_count DESC`,
    language: 'SQL',
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};

export const NoLanguage: Story = {
  args: {
    value: 'MATCH (n) RETURN n LIMIT 10',
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};

export const EmptyQuery: Story = {
  args: {
    value: '',
    language: 'Cypher',
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};

export const CardThumbnail: Story = {
  args: {
    value: `MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name, m.title
LIMIT 25`,
    language: 'Cypher',
  },
  decorators: [
    (Story) => (
      <div className="w-[280px] rounded-lg border bg-card p-3 flex flex-col gap-2.5">
        <p className="font-medium text-sm">Actor Movies</p>
        <Story />
        <div className="flex gap-1.5">
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">Bar Chart</span>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs">neo4j</span>
        </div>
      </div>
    ),
  ],
};

export const TruncatedWithExpand: Story = {
  args: {
    value: `MATCH (p:Person)-[:ACTED_IN]->(m:Movie)<-[:DIRECTED]-(d:Director)
WHERE m.released > 2000 AND m.budget > 1000000
WITH p, m, d, m.revenue - m.budget AS profit
WHERE profit > 0
RETURN p.name AS actor, d.name AS director, m.title AS movie,
       m.released AS year, m.budget AS budget, m.revenue AS revenue,
       profit
ORDER BY profit DESC
LIMIT 100`,
    language: 'Cypher',
    maxLines: 6,
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
};
