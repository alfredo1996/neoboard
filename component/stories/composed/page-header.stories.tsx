import type { Meta, StoryObj } from '@storybook/react';
import { PageHeader } from '@/components/composed/page-header';
import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const meta = {
  title: 'Composed/PageHeader',
  component: PageHeader,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  argTypes: {
    title: { control: 'text' },
    description: { control: 'text' },
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Dashboard',
  },
};

export const WithDescription: Story = {
  args: {
    title: 'Dashboard',
    description: 'Overview of your data and metrics.',
  },
};

export const WithActions: Story = {
  args: {
    title: 'Projects',
    description: 'Manage your projects and tasks.',
    actions: (
      <>
        <Button variant="outline">Export</Button>
        <Button>New Project</Button>
      </>
    ),
  },
};

export const WithBreadcrumb: Story = {
  args: {
    title: 'Project Settings',
    description: 'Configure your project preferences.',
    breadcrumb: (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Settings</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    ),
    actions: <Button>Save Changes</Button>,
  },
};
