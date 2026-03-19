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

-- dash-003: Chart Showcase — all v0.8 chart types, owned by Alice, public
INSERT INTO "dashboard" ("id", "userId", "tenant_id", "name", "description", "isPublic", "updated_by", "layoutJson") VALUES
    ('dash-003', 'user-alice-001', 'default', 'Chart Showcase', 'Exercises all v0.8 chart types across Neo4j and PostgreSQL', true, 'user-alice-001',
     '{"version":2,"pages":[
       {"id":"page-new-charts-neo4j","title":"New Charts (Neo4j)","widgets":[
         {"id":"w1","chartType":"gauge","connectionId":"conn-neo4j-001","query":"MATCH (m:Movie) RETURN count(m) AS value, ''Total Movies'' AS name","settings":{"title":"Movie Count","clickAction":{"type":"set-parameter","parameterName":"movie_count","sourceField":"value"}}},
         {"id":"w2","chartType":"treemap","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WITH m, count(p) AS cast RETURN m.title AS name, cast AS value ORDER BY cast DESC LIMIT 15","settings":{"title":"Movies by Cast Size","stylingConfig":{"rules":[{"field":"value","operator":">","value":5,"target":"color","style":"#ef4444"},{"field":"value","operator":"<=","value":3,"target":"color","style":"#22c55e"}]}}},
         {"id":"w3","chartType":"radar","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) WITH type(r) AS indicator, count(*) AS value RETURN indicator, value, 100 AS max","settings":{"title":"Relationship Types","colorPalette":"warm-sunset"}},
         {"id":"w4","chartType":"sankey","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) WHERE type(r) IN [''ACTED_IN'',''DIRECTED''] WITH p.name AS source, m.title AS target, 1 AS value RETURN source, target, value LIMIT 20","settings":{"title":"People \u2192 Movies Flow"}},
         {"id":"w5","chartType":"sunburst","connectionId":"conn-neo4j-001","query":"MATCH (p:Person)-[r]->(m:Movie) RETURN type(r) AS parent, m.title AS name, 1 AS value LIMIT 30","settings":{"title":"Movies by Relationship"}}
       ],"gridLayout":[
         {"i":"w1","x":0,"y":0,"w":3,"h":3},
         {"i":"w2","x":3,"y":0,"w":5,"h":4},
         {"i":"w3","x":8,"y":0,"w":4,"h":4},
         {"i":"w4","x":0,"y":4,"w":6,"h":4},
         {"i":"w5","x":6,"y":4,"w":6,"h":4}
       ]},
       {"id":"page-new-charts-pg","title":"New Charts (PostgreSQL)","widgets":[
         {"id":"w6","chartType":"gauge","connectionId":"conn-pg-001","query":"SELECT count(*) AS value, ''Total Movies'' AS name FROM movies","settings":{"title":"PG Movie Count"}},
         {"id":"w7","chartType":"treemap","connectionId":"conn-pg-001","query":"SELECT m.title AS name, count(r.id) AS value FROM movies m JOIN roles r ON r.movie_id = m.id GROUP BY m.title ORDER BY value DESC LIMIT 15","settings":{"title":"Movies by Role Count","stylingConfig":{"rules":[{"field":"value","operator":">","value":5,"target":"color","style":"#ef4444"},{"field":"value","operator":"<=","value":3,"target":"color","style":"#22c55e"}]}}},
         {"id":"w8","chartType":"radar","connectionId":"conn-pg-001","query":"SELECT r.relationship AS indicator, count(*) AS value, 100 AS max FROM roles r GROUP BY r.relationship","settings":{"title":"Role Distribution","colorPalette":"cool-breeze"}},
         {"id":"w9","chartType":"sankey","connectionId":"conn-pg-001","query":"SELECT p.name AS source, m.title AS target, 1 AS value FROM roles r JOIN people p ON p.id = r.person_id JOIN movies m ON m.id = r.movie_id WHERE r.relationship IN (''ACTED_IN'',''DIRECTED'') LIMIT 20","settings":{"title":"PG People \u2192 Movies"}},
         {"id":"w10","chartType":"pie","connectionId":"conn-pg-001","query":"SELECT r.relationship AS name, count(*) AS value FROM roles r GROUP BY r.relationship","settings":{"title":"Roles Breakdown"}}
       ],"gridLayout":[
         {"i":"w6","x":0,"y":0,"w":3,"h":3},
         {"i":"w7","x":3,"y":0,"w":5,"h":4},
         {"i":"w8","x":8,"y":0,"w":4,"h":4},
         {"i":"w9","x":0,"y":4,"w":6,"h":4},
         {"i":"w10","x":6,"y":4,"w":6,"h":4}
       ]},
       {"id":"page-content","title":"Content Widgets","widgets":[
         {"id":"w11","chartType":"markdown","settings":{"title":"Welcome","content":"# Movie Dashboard\n\nWelcome to the **NeoBoard** showcase.\n\n- Explore charts across Neo4j and PostgreSQL\n- Try the $param_search parameter\n\n> Built with NeoBoard v0.8"}},
         {"id":"w12","chartType":"iframe","settings":{"title":"Neo4j Product Page","url":"https://neo4j.com/product/neo4j-graph-database/"}}
       ],"gridLayout":[
         {"i":"w11","x":0,"y":0,"w":6,"h":5},
         {"i":"w12","x":6,"y":0,"w":6,"h":5}
       ]}
     ]}'::jsonb);

-- Seed dashboard share (Alice shares her dashboard with Bob as viewer)
INSERT INTO "dashboard_share" ("id", "dashboardId", "userId", "tenant_id", "role") VALUES
    ('share-001', 'dash-001', 'user-bob-002', 'default', 'viewer');
