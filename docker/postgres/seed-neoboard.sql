-- =============================================================================
-- Neoboard seed data for E2E tests
-- Applied by global-setup.ts AFTER Drizzle migrations create the schema.
-- =============================================================================

-- Seed users (password: password123, bcrypt hash)
-- Alice is admin so she can manage connections and all dashboards
-- Bob is creator so he can create his own dashboards
INSERT INTO "user" ("id", "name", "email", "passwordHash", "role", "can_write") VALUES
    ('user-alice-001', 'Alice Demo', 'alice@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'admin', true),
    ('user-bob-002',   'Bob Demo',   'bob@example.com',   '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6', 'creator', true);

-- Seed connections (configEncrypted values are placeholders — global-setup.ts re-encrypts them with real ports)
INSERT INTO "connection" ("id", "userId", "name", "type", "configEncrypted") VALUES
    ('conn-neo4j-001', 'user-alice-001', 'Movies Graph (Neo4j)',    'neo4j',      '{"host":"bolt://neo4j:7687","username":"neo4j","password":"neoboard123"}'),
    ('conn-pg-001',    'user-alice-001', 'Movies DB (PostgreSQL)',  'postgresql', '{"host":"postgres","port":5432,"database":"movies","username":"neoboard","password":"neoboard"}');

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
         {"id":"w11","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade","settings":{"title":"Movies by Decade (styled)","stylingConfig":{"enabled":true,"rules":[{"id":"r1","operator":"<=","value":2,"color":"#ef4444","target":"color"},{"id":"r2","operator":"<=","value":5,"color":"#f59e0b","target":"color"},{"id":"r3","operator":"<=","value":10,"color":"#22c55e","target":"color"}]}}},
         {"id":"w12","chartType":"single-value","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN count(m) AS value","settings":{"title":"Total Movies (blue > 30)","stylingConfig":{"enabled":true,"rules":[{"id":"r4","operator":">","value":30,"color":"#3b82f6","target":"color"}]}}}
       ],"gridLayout":[
         {"i":"w11","x":0,"y":0,"w":6,"h":4},
         {"i":"w12","x":6,"y":0,"w":3,"h":2}
       ]},
       {"id":"page-palettes","title":"Color Palettes","widgets":[
         {"id":"w13","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"deep-ocean","colorPalette":"deep-ocean"}},
         {"id":"w14","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"warm-sunset","colorPalette":"warm-sunset"}},
         {"id":"w15","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"neon","colorPalette":"neon"}},
         {"id":"w16","chartType":"pie","connectionId":"conn-neo4j-001","query":"MATCH ()-[r]->() RETURN type(r) AS name, count(*) AS value","settings":{"title":"monochrome","colorPalette":"monochrome"}}
       ],"gridLayout":[
         {"i":"w13","x":0,"y":0,"w":6,"h":4},
         {"i":"w14","x":6,"y":0,"w":6,"h":4},
         {"i":"w15","x":0,"y":4,"w":6,"h":4},
         {"i":"w16","x":6,"y":4,"w":6,"h":4}
       ]},
       {"id":"page-a11y","title":"Accessibility","widgets":[
         {"id":"w17","chartType":"bar","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN (m.released / 10) * 10 AS decade, count(*) AS count ORDER BY decade","settings":{"title":"Colorblind Mode","colorblindMode":true}}
       ],"gridLayout":[
         {"i":"w17","x":0,"y":0,"w":8,"h":5}
       ]}
     ]}'::jsonb);

-- Seed dashboard share (Alice shares her dashboard with Bob as viewer)
INSERT INTO "dashboard_share" ("id", "dashboardId", "userId", "tenant_id", "role") VALUES
    ('share-001', 'dash-001', 'user-bob-002', 'default', 'viewer');
