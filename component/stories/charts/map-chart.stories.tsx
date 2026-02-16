import type { Meta, StoryObj } from '@storybook/react';
import { MapChart } from '@/charts/map-chart';

const meta = {
  title: 'Charts/MapChart',
  component: MapChart,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div style={{ height: 500, width: '100%' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MapChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const worldCities = [
  { id: '1', lat: 40.7128, lng: -74.006, label: 'New York', value: 20 },
  { id: '2', lat: 51.5074, lng: -0.1278, label: 'London', value: 18 },
  { id: '3', lat: 35.6762, lng: 139.6503, label: 'Tokyo', value: 22 },
  { id: '4', lat: -33.8688, lng: 151.2093, label: 'Sydney', value: 10 },
  { id: '5', lat: 48.8566, lng: 2.3522, label: 'Paris', value: 15 },
  { id: '6', lat: -23.5505, lng: -46.6333, label: 'São Paulo', value: 16 },
  { id: '7', lat: 55.7558, lng: 37.6173, label: 'Moscow', value: 12 },
  { id: '8', lat: 28.6139, lng: 77.209, label: 'Delhi', value: 25 },
];

export const Default: Story = {
  args: {
    markers: worldCities,
    center: [20, 0],
    zoom: 2,
  },
};

export const AutoFitBounds: Story = {
  args: {
    markers: worldCities,
    autoFitBounds: true,
  },
};

export const CartoLight: Story = {
  args: {
    markers: worldCities,
    tileLayer: 'carto-light',
    autoFitBounds: true,
  },
};

export const CartoDark: Story = {
  args: {
    markers: worldCities,
    tileLayer: 'carto-dark',
    autoFitBounds: true,
  },
};

export const WithPopups: Story = {
  args: {
    markers: [
      {
        id: '1',
        lat: 40.7128,
        lng: -74.006,
        label: 'New York',
        value: 20,
        popup: '<b>New York City</b><br/>Population: 8.3M<br/>State: New York',
      },
      {
        id: '2',
        lat: 51.5074,
        lng: -0.1278,
        label: 'London',
        value: 18,
        popup: '<b>London</b><br/>Population: 8.9M<br/>Country: United Kingdom',
      },
      {
        id: '3',
        lat: 35.6762,
        lng: 139.6503,
        label: 'Tokyo',
        value: 22,
        popup: '<b>Tokyo</b><br/>Population: 13.9M<br/>Country: Japan',
      },
    ],
    autoFitBounds: true,
  },
};

export const WithProperties: Story = {
  args: {
    markers: [
      {
        id: '1',
        lat: 40.7128,
        lng: -74.006,
        label: 'NYC Office',
        value: 15,
        properties: { region: 'Americas', employees: 250, status: 'Active' },
      },
      {
        id: '2',
        lat: 51.5074,
        lng: -0.1278,
        label: 'London Office',
        value: 12,
        properties: { region: 'EMEA', employees: 180, status: 'Active' },
      },
      {
        id: '3',
        lat: 1.3521,
        lng: 103.8198,
        label: 'Singapore Office',
        value: 8,
        properties: { region: 'APAC', employees: 90, status: 'New' },
      },
    ],
    autoFitBounds: true,
    fitBoundsPadding: [40, 40],
  },
};

export const ZoomedIn: Story = {
  args: {
    markers: [
      { id: '1', lat: 40.7128, lng: -74.006, label: 'New York', value: 20 },
      { id: '2', lat: 40.758, lng: -73.9855, label: 'Times Square', value: 8 },
      { id: '3', lat: 40.7484, lng: -73.9857, label: 'Empire State', value: 12 },
    ],
    center: [40.75, -73.99],
    zoom: 13,
  },
};

export const ColorCoded: Story = {
  args: {
    markers: [
      { id: '1', lat: 40.71, lng: -74.0, label: 'Critical', value: 15, color: '#ef4444' },
      { id: '2', lat: 51.51, lng: -0.13, label: 'Warning', value: 12, color: '#f59e0b' },
      { id: '3', lat: 35.68, lng: 139.65, label: 'Healthy', value: 10, color: '#22c55e' },
      { id: '4', lat: 48.86, lng: 2.35, label: 'Healthy', value: 8, color: '#22c55e' },
    ],
    center: [30, 40],
    zoom: 2,
  },
};

export const Loading: Story = {
  args: {
    markers: worldCities,
    loading: true,
  },
};

export const ErrorState: Story = {
  args: {
    error: new Error('Failed to load map data'),
  },
};

export const Empty: Story = {
  args: {
    markers: [],
    center: [20, 0],
    zoom: 2,
  },
};
