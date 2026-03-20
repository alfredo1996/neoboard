import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownWidget } from "@/components/composed/markdown-widget";

const meta = {
  title: "Composed/MarkdownWidget",
  component: MarkdownWidget,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 400 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarkdownWidget>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    content: `# Dashboard Overview

Welcome to your **NeoBoard** dashboard. This widget renders markdown content.

## Key Metrics

- Total Users: **12,450**
- Active Sessions: **342**
- Revenue Today: **$8,920**

## Notes

This week's performance has been _above average_. The team has been working on new features and the deployment went smoothly.

> All systems are operating normally as of today.

---

For more details, contact the analytics team.`,
  },
};

export const Empty: Story = {
  args: {
    content: undefined,
  },
};

export const CodeBlocks: Story = {
  args: {
    content: `# Query Examples

Use these Cypher queries to explore your graph data.

## Find all users

\`\`\`cypher
MATCH (u:User)
RETURN u.name, u.email
ORDER BY u.name
LIMIT 25
\`\`\`

## Count relationships

\`\`\`cypher
MATCH (n)-[r]->(m)
RETURN type(r) AS relationship, count(*) AS count
ORDER BY count DESC
\`\`\`

## SQL example

\`\`\`sql
SELECT users.name, COUNT(orders.id) AS order_count
FROM users
JOIN orders ON users.id = orders.user_id
GROUP BY users.name
ORDER BY order_count DESC;
\`\`\`

Use inline code like \`MATCH (n) RETURN n\` for short snippets.`,
  },
};

export const WithLinks: Story = {
  args: {
    content: `# Resources & Links

## Documentation

- [NeoBoard GitHub](https://github.com/alfredo1996/neoboard) — Source code and issues
- [Neo4j Documentation](https://neo4j.com/docs/) — Graph database reference
- [PostgreSQL Docs](https://www.postgresql.org/docs/) — Relational database reference

## Quick Reference

For Cypher syntax, see the [Cypher Manual](https://neo4j.com/docs/cypher-manual/current/).

Images can also be embedded:

![NeoBoard Logo](https://via.placeholder.com/200x60?text=NeoBoard)

**Note:** Links always open in a new tab for security.`,
  },
};

export const Headings: Story = {
  args: {
    content: `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6

Each heading level uses progressively smaller text with **bold** formatting applied to key terms.`,
  },
};

export const Lists: Story = {
  args: {
    content: `## Unordered List

- First item with **bold text**
- Second item with _italic text_
- Third item with \`inline code\`

## Ordered List

1. Connect your Neo4j database
2. Create a new dashboard
3. Add a graph widget
4. Run a Cypher query
5. Visualize your results

## Blockquote

> This is an important note about how data is processed.
> Always validate your queries before running them in production.`,
  },
};
