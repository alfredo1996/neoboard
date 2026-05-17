# @neoboard/cli

Install, run, and manage [NeoBoard](https://github.com/alfredo1996/neoboard) — open-source dashboards for Neo4j and PostgreSQL.

## Install

```bash
npx @neoboard/cli setup       # one-time: init + docker up + migrate
npx @neoboard/cli demo        # optional: seed showcase dashboards
# → http://localhost:3000
```

Or install globally:

```bash
npm install -g @neoboard/cli
neoboard --help
```

## Common commands

| Command | What it does |
| --- | --- |
| `neoboard setup` | Full first-time setup (Docker mode by default; `--mode local` for your own DBs) |
| `neoboard start` / `stop` | Start or stop NeoBoard services |
| `neoboard dev` | Next.js dev server with hot reload (auto-starts DBs) |
| `neoboard status` | Health of Postgres, Neo4j, and the app |
| `neoboard doctor` | Diagnose common setup problems with actionable hints |
| `neoboard db migrate` | Apply pending database migrations |
| `neoboard demo` | Seed showcase dashboards demonstrating every chart type |
| `neoboard plugin add <pkg>` | Install and register a chart or connector plugin |
| `neoboard logs [--service <name>] [--tail N]` | Tail container logs |

Run `neoboard <command> --help` for flags and details on any command.

## Troubleshooting

Failed commands print actionable hints (missing env vars, validator failures, migration drift). If something still doesn't make sense, see the [Troubleshooting Setup](https://github.com/alfredo1996/neoboard/blob/main/docs/src/content/docs/getting-started/troubleshooting.mdx) guide.

## License

Elastic License 2.0 — see [LICENSE](./LICENSE).
