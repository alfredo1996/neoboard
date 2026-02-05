# NeoBoard Component Library

A comprehensive React component library built with shadcn/ui, TailwindCSS, and ECharts for dashboard applications.

## Project Structure

```
component/
├── src/
│   ├── components/
│   │   ├── ui/              # shadcn base components
│   │   └── composed/        # Custom composed components
│   ├── charts/              # ECharts-based visualization components
│   ├── hooks/               # Custom React hooks
│   │   ├── useContainerSize.ts
│   │   └── useWidgetSize.ts
│   ├── lib/
│   │   └── utils.ts         # Utility functions (cn, etc)
│   ├── utils/               # Additional utilities
│   ├── index.css            # Tailwind CSS with custom theme
│   └── index.ts             # Library entry point
├── components.json          # shadcn configuration
├── tailwind.config.js       # Tailwind CSS config
├── postcss.config.js        # PostCSS config
├── vite.config.ts           # Vite build config
├── tsconfig.json            # TypeScript config
└── package.json             # Dependencies and scripts
```

## Setup Status

✅ **Configured**
- TypeScript (5.9.3)
- Vite (7.2.4)
- React (19.2.0)
- TailwindCSS (3.4.1)
- shadcn/ui MCP integration
- Directory structure
- Core utility hooks

⏳ **Next Steps**
1. Install dependencies: `npm install` (from component directory)
2. Initialize shadcn: `npx shadcn-ui@latest init`
3. Add Phase 1-5 base components
4. Add Phase 6-13 composed components and features
5. Set up Storybook for component documentation
6. Add Vitest for component testing

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build library
npm run build

# Start Storybook
npm run storybook

# Run tests
npm run test
```

## Component Phases

- **Phase 1-5**: shadcn Base Components (33 components)
- **Phase 6**: Core Composed Components (6 components)
- **Phase 7**: Widget Cards (5 components)
- **Phase 8**: Dashboard Layout (4 components)
- **Phase 9**: Filters (4 components)
- **Phase 10**: Data Connection (3 components)
- **Phase 11**: Data Grid (4 components)
- **Phase 12**: Chart Config (3 components)
- **Phase 13**: Utility Components (5 components)
- **Charts**: Core and Chart Types (6 components)

Total: ~75 components

## Key Tools

- **MCP Server**: shadcn for component installation
- **Build**: Vite with ESM/UMD outputs
- **Testing**: Vitest + React Testing Library
- **Documentation**: Storybook
- **Styling**: TailwindCSS + class-variance-authority
- **Visualization**: ECharts + echarts-for-react
