import type { Meta, StoryObj } from '@storybook/react';
import { CodeBlock } from '@/components/composed/code-block';

const meta = {
  title: 'Composed/CodeBlock',
  component: CodeBlock,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
  argTypes: {
    language: { control: 'text' },
    showLineNumbers: { control: 'boolean' },
    showCopyButton: { control: 'boolean' },
  },
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    code: 'npm install @shadcn/ui',
    className: 'w-[400px]',
  },
};

export const WithLanguage: Story = {
  args: {
    code: `const greeting = "Hello, World!";
console.log(greeting);`,
    language: 'javascript',
    className: 'w-[400px]',
  },
};

export const WithLineNumbers: Story = {
  args: {
    code: `import { Button } from '@/components/ui/button';

function App() {
  return (
    <Button variant="outline">
      Click me
    </Button>
  );
}

export default App;`,
    language: 'tsx',
    showLineNumbers: true,
    className: 'w-[500px]',
  },
};

export const CypherQuery: Story = {
  args: {
    code: `MATCH (n:Person)-[r:KNOWS]->(m:Person)
WHERE n.name = 'Alice'
RETURN n, r, m
LIMIT 10`,
    language: 'cypher',
    showLineNumbers: true,
    className: 'w-[500px]',
  },
};

export const NoCopyButton: Story = {
  args: {
    code: 'const x = 1;',
    showCopyButton: false,
    className: 'w-[300px]',
  },
};

export const SQL: Story = {
  args: {
    code: `SELECT users.name, orders.total
FROM users
INNER JOIN orders ON users.id = orders.user_id
WHERE orders.status = 'completed'
ORDER BY orders.total DESC
LIMIT 10;`,
    language: 'sql',
    showLineNumbers: true,
    className: 'w-[500px]',
  },
};
