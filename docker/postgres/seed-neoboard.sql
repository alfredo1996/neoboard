-- =============================================================================
-- Neoboard seed data for E2E tests
-- Applied by global-setup.ts AFTER Drizzle migrations create the schema.
-- =============================================================================

-- Seed users (password: password123, bcrypt hash)
-- Alice is admin so she can manage connections and all dashboards
-- Bob is creator so he can create his own dashboards
-- Carol is reader (no write, no create) — sharing permission tests
-- Dave is a second creator — recipient for sharing permission tests
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "can_write") VALUES
    ('user-alice-001', 'Alice Demo', 'alice@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'admin',   true),
    ('user-bob-002',   'Bob Demo',   'bob@example.com',   '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'creator', true),
    ('user-carol-003', 'Carol Demo', 'carol@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'reader',  false),
    ('user-dave-004',  'Dave Demo',  'dave@example.com',  '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'creator', true);

-- Seed connections — configEncrypted values are PLAINTEXT PLACEHOLDERS.
-- E2E global-setup.ts re-encrypts them with the test ENCRYPTION_KEY and
-- replaces hostnames with Testcontainer ports before tests run.
-- These MUST NOT be used as-is in Docker demo mode (use seed-demo.mjs instead).
INSERT INTO "connection" ("id", "userId", "name", "type", "configEncrypted") VALUES
    ('conn-neo4j-001', 'user-alice-001', 'Movies Graph (Neo4j)',    'neo4j',      '{"uri":"bolt://localhost:7687","username":"neo4j","password":"neoboard123","database":"neo4j"}'),
    ('conn-pg-001',    'user-alice-001', 'Movies DB (PostgreSQL)',  'postgresql', '{"uri":"postgresql://localhost:5432","username":"neoboard","password":"neoboard","database":"movies"}');

-- Seed dashboards (v2 layout with pages — matches current schema)
-- dash-001 has TWO pages so the tab-switch performance test can run
INSERT INTO "dashboard" ("id", "userId", "tenant_id", "name", "description", "isPublic", "updated_by", "layoutJson") VALUES
    ('dash-001', 'user-alice-001', 'default', 'Movie Analytics', 'Explore the movies dataset across Neo4j and PostgreSQL', true, 'user-alice-001',
     '{"version":2,"pages":[
       {"id":"page-overview","title":"Overview","widgets":[
         {"id":"w1","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 10","settings":{"title":"Top 10 Movies by Cast Size"}},
         {"id":"w2","chartType":"line","connectionId":"conn-pg-001","query":"SELECT released AS year, COUNT(*) AS movie_count FROM movies GROUP BY released ORDER BY released","settings":{"title":"Movies Released per Year"}}
       ],"gridLayout":[
         {"i":"w1","x":0,"y":0,"w":6,"h":4},
         {"i":"w2","x":6,"y":0,"w":6,"h":4}
       ]},
       {"id":"page-details","title":"Details","widgets":[
         {"id":"w3","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name AS director, count(m) AS movies_directed ORDER BY movies_directed DESC LIMIT 10","settings":{"title":"Most Prolific Directors"}}
       ],"gridLayout":[
         {"i":"w3","x":0,"y":0,"w":12,"h":5}
       ]}
     ]}'::jsonb),
    ('dash-002', 'user-bob-002', 'default', 'Actor Network', 'Graph-based actor collaboration insights', false, 'user-bob-002',
     '{"version":2,"pages":[
       {"id":"page-1","title":"Page 1","widgets":[
         {"id":"w1","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name AS director, count(m) AS movies_directed ORDER BY movies_directed DESC LIMIT 10","settings":{"title":"Most Prolific Directors"}}
       ],"gridLayout":[
         {"i":"w1","x":0,"y":0,"w":12,"h":5}
       ]}
     ]}'::jsonb);

-- dash-003: Widget Showcase — all chart types with styling, click actions, palettes, accessibility
INSERT INTO "dashboard" ("id", "userId", "tenant_id", "name", "description", "isPublic", "updated_by", "layoutJson") VALUES
    ('dash-003', 'user-alice-001', 'default', 'Widget Showcase', 'All chart types: simple, rule-based styling, click actions, color palettes, and accessibility.', true, 'user-alice-001',
     '{"version":2,"pages":[
       {"id":"page-simple","title":"Simple Charts","widgets":[
         {"id":"w1","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade","settings":{"title":"Movies by Decade"}},
         {"id":"w2","chartType":"line","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year","settings":{"title":"Releases Over Time"}},
         {"id":"w3","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS count","settings":{"title":"Relationship Types"}},
         {"id":"w4","chartType":"single-value","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN count(m) AS value","settings":{"title":"Total Movies"}},
         {"id":"w5","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN m.title AS title, m.released AS released ORDER BY m.released DESC","settings":{"title":"All Movies"}},
         {"id":"w6","chartType":"gauge","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN count(m) AS value, ''Total Movies'' AS name","settings":{"title":"Movie Count"}},
         {"id":"w7","chartType":"radar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value","settings":{"title":"Relationship Radar"}},
         {"id":"w8","chartType":"sankey","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) WHERE type(r) IN [''ACTED_IN'',''DIRECTED''] WITH p.name AS source, m.title AS target, 1 AS value RETURN source, target, value LIMIT 20","settings":{"title":"People → Movies"}},
         {"id":"w9","chartType":"treemap","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15","settings":{"title":"Movies by Cast Size"}},
         {"id":"w10","chartType":"sunburst","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() WITH type(r) AS relType, count(*) AS cnt RETURN '''' AS parent, relType AS name, cnt AS value UNION ALL MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS relType, m.title AS movie, count(p) AS cnt RETURN relType AS parent, movie AS name, cnt AS value UNION ALL MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS parent, p.name AS name, 1 AS value LIMIT 20","settings":{"title":"Movies by Relationship"}}
       ],"gridLayout":[
         {"i":"w1","x":0,"y":0,"w":6,"h":4},
         {"i":"w2","x":6,"y":0,"w":6,"h":4},
         {"i":"w3","x":0,"y":4,"w":4,"h":4},
         {"i":"w4","x":4,"y":4,"w":4,"h":2},
         {"i":"w5","x":8,"y":4,"w":4,"h":4},
         {"i":"w6","x":0,"y":8,"w":3,"h":3},
         {"i":"w7","x":3,"y":8,"w":4,"h":4},
         {"i":"w8","x":7,"y":8,"w":5,"h":4},
         {"i":"w9","x":0,"y":12,"w":6,"h":4},
         {"i":"w10","x":6,"y":12,"w":6,"h":4}
       ]},
       {"id":"page-styling","title":"Rule-Based Styling","widgets":[
         {"id":"w11","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade","settings":{"title":"Movies by Decade (styled bars)","stylingConfig":{"enabled":true,"rules":[{"id":"r1","operator":"<=","value":3,"color":"#ef4444","target":"color"},{"id":"r2","operator":"<=","value":8,"color":"#f59e0b","target":"color"},{"id":"r3","operator":">=","value":1,"color":"#22c55e","target":"color"}]}}},
         {"id":"w12","chartType":"single-value","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN count(m) AS value","settings":{"title":"Total Movies (blue > 30)","stylingConfig":{"enabled":true,"rules":[{"id":"r4","operator":">","value":30,"color":"#3b82f6","target":"color"}]}}},
         {"id":"w18","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 15","settings":{"title":"Actors — styled rows (bg + bold)","chartOptions":{"enableSorting":true,"enablePagination":true,"pageSize":10},"stylingConfig":{"enabled":true,"rules":[{"id":"rs1","column":"movies","operator":">=","value":4,"color":"#22c55e","target":"backgroundColor","bold":true},{"id":"rs2","column":"movies","operator":"<=","value":1,"color":"#ef4444","target":"backgroundColor"},{"id":"rs3","column":"movies","operator":"between","value":2,"valueTo":3,"color":"#fbbf24","target":"backgroundColor"}]}}},
         {"id":"w19","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 15","settings":{"title":"Actors — color scale gradient","chartOptions":{"enableSorting":true,"enablePagination":true,"pageSize":10},"conditionalFormatting":{"colorScales":[{"column":"movies","minColor":"#fde68a","maxColor":"#16a34a"}]}}}
       ],"gridLayout":[
         {"i":"w11","x":0,"y":0,"w":6,"h":4},
         {"i":"w12","x":6,"y":0,"w":3,"h":2},
         {"i":"w18","x":0,"y":4,"w":6,"h":5},
         {"i":"w19","x":6,"y":4,"w":6,"h":5}
       ]},
       {"id":"page-table","title":"Table Features","widgets":[
         {"id":"w20","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN p.name AS actor, m.title AS movie, m.released AS year ORDER BY actor, year DESC LIMIT 50","settings":{"title":"Grouped by Actor (count)","chartOptions":{"enableSorting":true,"enableColumnResizing":true,"enablePagination":true,"pageSize":15,"enableGrouping":true,"groupBy":"actor","aggregationFn":"count"}}},
         {"id":"w21","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS role, p.name AS person, m.title AS movie, m.released AS year ORDER BY role, person LIMIT 60","settings":{"title":"Grouped by Role + Person (count)","chartOptions":{"enableSorting":true,"enableColumnResizing":true,"enablePagination":true,"pageSize":20,"enableGrouping":true,"groupBy":"role","aggregationFn":"count"}}},
         {"id":"w22","chartType":"table","connectionId":"conn-pg-001","query":"SELECT m.title, m.released, p.name AS director FROM movies m JOIN roles r ON r.movie_id = m.id AND r.relationship = ''DIRECTED'' JOIN people p ON p.id = r.person_id ORDER BY m.released DESC","settings":{"title":"PostgreSQL — resizable columns","chartOptions":{"enableSorting":true,"enableColumnResizing":true,"enableGlobalFilter":true,"enableColumnFilters":true,"enablePagination":true,"pageSize":10}}}
       ],"gridLayout":[
         {"i":"w20","x":0,"y":0,"w":6,"h":6},
         {"i":"w21","x":6,"y":0,"w":6,"h":6},
         {"i":"w22","x":0,"y":6,"w":12,"h":5}
       ]},
       {"id":"page-palettes","title":"Color Palettes","widgets":[
         {"id":"w13","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"deep-ocean","chartOptions":{"colorPalette":"deep-ocean"}}},
         {"id":"w14","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"warm-sunset","chartOptions":{"colorPalette":"warm-sunset"}}},
         {"id":"w15","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"neon","chartOptions":{"colorPalette":"neon"}}},
         {"id":"w16","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"monochrome","chartOptions":{"colorPalette":"monochrome"}}}
       ],"gridLayout":[
         {"i":"w13","x":0,"y":0,"w":6,"h":4},
         {"i":"w14","x":6,"y":0,"w":6,"h":4},
         {"i":"w15","x":0,"y":4,"w":6,"h":4},
         {"i":"w16","x":6,"y":4,"w":6,"h":4}
       ]},
       {"id":"page-a11y","title":"Accessibility","widgets":[
         {"id":"w17","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade","settings":{"title":"Colorblind Mode","chartOptions":{"colorblindMode":true}}}
       ],"gridLayout":[
         {"i":"w17","x":0,"y":0,"w":8,"h":5}
       ]}
     ]}'::jsonb);

-- dash-004: Transform Playground — demonstrates all transform types with pre-configured pipelines
INSERT INTO "dashboard" ("id", "userId", "tenant_id", "name", "description", "isPublic", "updated_by", "layoutJson") VALUES
    ('dash-004', 'user-alice-001', 'default', 'Transform Playground', 'Test data transforms: filter, sort, groupBy, calculatedColumn, rename, limit — with live preview.', true, 'user-alice-001',
     '{"version":2,"pages":[
       {"id":"page-filter","title":"Filter & Sort","widgets":[
         {"id":"tf1","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 20","settings":{"title":"Top Movies — filter cast_size > 3","transforms":[{"type":"filter","column":"cast_size","operator":">","value":3}]}},
         {"id":"tf2","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 30","settings":{"title":"Actors sorted by movies desc + limit 10","chartOptions":{"enableSorting":true},"transforms":[{"type":"sort","column":"movies","direction":"desc"},{"type":"limit","count":10}]}},
         {"id":"tf3","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN m.released AS year, count(*) AS count ORDER BY year","settings":{"title":"Movies by Year — only 1990s (filter year >= 1990, year < 2000)","transforms":[{"type":"filter","column":"year","operator":">=","value":1990},{"type":"filter","column":"year","operator":"<","value":2000}]}}
       ],"gridLayout":[
         {"i":"tf1","x":0,"y":0,"w":6,"h":4},
         {"i":"tf2","x":6,"y":0,"w":6,"h":5},
         {"i":"tf3","x":0,"y":5,"w":8,"h":4}
       ]},
       {"id":"page-agg","title":"GroupBy & Calculated","widgets":[
         {"id":"tf4","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS role, p.name AS person, m.released AS year","settings":{"title":"Group by role — count + avg year","chartOptions":{"enableSorting":true},"transforms":[{"type":"groupBy","column":"role","aggregations":[{"column":"person","fn":"count"},{"column":"year","fn":"avg"}]}]}},
         {"id":"tf5","chartType":"table","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 20","settings":{"title":"Calculated: movies × 10 = score","chartOptions":{"enableSorting":true},"transforms":[{"type":"calculatedColumn","name":"score","expression":"movies * 10"}]}},
         {"id":"tf6","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH p.name AS actor, count(m) AS movies RETURN actor, movies ORDER BY movies DESC LIMIT 15","settings":{"title":"Rename → filter → limit pipeline","transforms":[{"type":"renameColumns","mapping":{"actor":"Star","movies":"Films"}},{"type":"filter","column":"Films","operator":">=","value":3},{"type":"limit","count":5}]}}
       ],"gridLayout":[
         {"i":"tf4","x":0,"y":0,"w":6,"h":5},
         {"i":"tf5","x":6,"y":0,"w":6,"h":5},
         {"i":"tf6","x":0,"y":5,"w":8,"h":4}
       ]}
     ]}'::jsonb);

-- Seed dashboard share (Alice shares her dashboard with Bob as viewer)
INSERT INTO "dashboard_share" ("id", "dashboardId", "userId", "tenant_id", "role") VALUES
    ('share-001', 'dash-001', 'user-bob-002', 'default', 'viewer');
