# Migrating from NeoDash to NeoBoard: A Complete Guide

> **Draft blog post** — publish on Dev.to, Medium, and the project blog after v2.1 release.

---

If you've been using NeoDash to build dashboards on top of Neo4j, you've probably noticed that Neo4j Labs has deprecated the project. The repository now states: _"This project is no longer maintained, use at your own risk."_

Neo4j's recommended alternatives are either the cloud-only Console Dashboards (locked to Aura) or purchasing a commercial NeoDash license bundled with Neo4j Enterprise. Neither is great if you're self-hosting.

**NeoBoard is the open-source alternative.** It's a maintained, modern dashboard tool purpose-built for Neo4j and PostgreSQL. And it has a built-in NeoDash import converter.

## What you get by switching

- **Still works with Neo4j** — Cypher queries, graph visualization (Neo4j NVL), all chart types
- **PostgreSQL too** — connect both databases in the same dashboard
- **Modern stack** — Next.js 16, React 19, TypeScript, ECharts
- **More chart types** — 17 types including Sankey, Sunburst, Treemap, Radar
- **Click actions** — drill-down from one chart to another via parameter binding
- **Conditional styling** — color-code cells, rows, and chart elements based on values
- **Write queries** — form widgets that execute INSERT/CREATE statements
- **Security** — AES-256-GCM credential encryption, multi-tenant isolation, SSO

## How to migrate (5 minutes)

### 1. Export from NeoDash

Open your dashboard in NeoDash, go to Settings, and save as JSON.

### 2. Import into NeoBoard

In NeoBoard, click "Import Dashboard" on the dashboard list page. Upload your JSON file. NeoBoard auto-detects the NeoDash format and converts everything:

- All chart types mapped (table, bar, line, graph, map, pie, gauge, etc.)
- Parameters converted (`$neodash_` prefix becomes `$param_`)
- Grid layout preserved

### 3. Map connections

NeoDash doesn't include connection details in exports. Select your NeoBoard connection for each slot and you're done.

## What's different

The biggest change: NeoBoard has its own user management and PostgreSQL metadata database. Your dashboards, connections, and users are stored in NeoBoard's database — not in Neo4j like NeoDash did.

This means you get proper multi-user support, role-based access (admin/creator/reader), and the ability to share dashboards without sharing database credentials.

## Try it now

```bash
git clone https://github.com/alfredo1996/neoboard.git
cd neoboard
scripts/setup.sh
npm run dev
```

Open `http://localhost:3000`, create your admin account, and import your first NeoDash dashboard.

---

_NeoBoard is open-source under the Elastic License 2.0. Free to use, modify, and self-host._

**Links:**

- GitHub: https://github.com/alfredo1996/neoboard
- Migration Guide: [link to docs]
- Discussion: [link to GitHub Discussions]
