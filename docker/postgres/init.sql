-- =============================================================================
-- Neoboard PostgreSQL Init Script
-- Runs on first container startup via /docker-entrypoint-initdb.d/
-- =============================================================================

-- -------------------------------------------------------
-- 1. App schema (neoboard database) — tables + seed data
-- -------------------------------------------------------

-- Enums
CREATE TYPE "public"."connection_type" AS ENUM('neo4j', 'postgresql');
CREATE TYPE "public"."share_role" AS ENUM('viewer', 'editor');

-- Tables
CREATE TABLE "user" (
    "id" text PRIMARY KEY NOT NULL,
    "name" text,
    "email" text,
    "emailVerified" timestamp,
    "image" text,
    "passwordHash" text,
    "createdAt" timestamp DEFAULT now(),
    CONSTRAINT "user_email_unique" UNIQUE("email")
);

CREATE TABLE "account" (
    "userId" text NOT NULL,
    "type" text NOT NULL,
    "provider" text NOT NULL,
    "providerAccountId" text NOT NULL,
    "refresh_token" text,
    "access_token" text,
    "expires_at" integer,
    "token_type" text,
    "scope" text,
    "id_token" text,
    "session_state" text,
    PRIMARY KEY ("provider", "providerAccountId")
);

CREATE TABLE "session" (
    "sessionToken" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "expires" timestamp NOT NULL
);

CREATE TABLE "verificationToken" (
    "identifier" text NOT NULL,
    "token" text NOT NULL,
    "expires" timestamp NOT NULL,
    PRIMARY KEY ("identifier", "token")
);

CREATE TABLE "connection" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "name" text NOT NULL,
    "type" "connection_type" NOT NULL,
    "configEncrypted" text NOT NULL,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
);

CREATE TABLE "dashboard" (
    "id" text PRIMARY KEY NOT NULL,
    "userId" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "layoutJson" jsonb DEFAULT '{"widgets":[],"gridLayout":[]}'::jsonb,
    "isPublic" boolean DEFAULT false,
    "createdAt" timestamp DEFAULT now(),
    "updatedAt" timestamp DEFAULT now()
);

CREATE TABLE "dashboard_share" (
    "id" text PRIMARY KEY NOT NULL,
    "dashboardId" text NOT NULL,
    "userId" text NOT NULL,
    "role" "share_role" NOT NULL,
    "createdAt" timestamp DEFAULT now()
);

-- Foreign keys
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "connection" ADD CONSTRAINT "connection_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_dashboardId_dashboard_id_fk" FOREIGN KEY ("dashboardId") REFERENCES "public"."dashboard"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dashboard_share" ADD CONSTRAINT "dashboard_share_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "dashboard" ADD CONSTRAINT "dashboard_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;

-- Seed users
-- Both use password: password123 (bcrypt hash)
INSERT INTO "user" ("id", "name", "email", "passwordHash") VALUES
    ('user-alice-001', 'Alice Demo', 'alice@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6'),
    ('user-bob-002', 'Bob Demo', 'bob@example.com', '$2b$12$Y9ET62vxVM7zf3tXwTQHSuJ4j3RqlZziI35aVgZzcL8bWBDcAM5b6');

-- Seed connections
-- configEncrypted values are placeholders — the app encrypts these at runtime
INSERT INTO "connection" ("id", "userId", "name", "type", "configEncrypted") VALUES
    ('conn-neo4j-001', 'user-alice-001', 'Movies Graph (Neo4j)', 'neo4j', '{"host":"bolt://neo4j:7687","username":"neo4j","password":"neoboard123"}'),
    ('conn-pg-001', 'user-alice-001', 'Movies DB (PostgreSQL)', 'postgresql', '{"host":"postgres","port":5432,"database":"movies","username":"neoboard","password":"neoboard"}');

-- Seed dashboards
INSERT INTO "dashboard" ("id", "userId", "name", "description", "isPublic", "layoutJson") VALUES
    ('dash-001', 'user-alice-001', 'Movie Analytics', 'Explore the movies dataset across Neo4j and PostgreSQL', true, '{
        "widgets": [
            {
                "id": "w1",
                "chartType": "bar",
                "connectionId": "conn-neo4j-001",
                "query": "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) RETURN m.title AS movie, count(p) AS cast_size ORDER BY cast_size DESC LIMIT 10",
                "settings": {"title": "Top 10 Movies by Cast Size"}
            },
            {
                "id": "w2",
                "chartType": "line",
                "connectionId": "conn-pg-001",
                "query": "SELECT released AS year, COUNT(*) AS movie_count FROM movies GROUP BY released ORDER BY released",
                "settings": {"title": "Movies Released per Year"}
            }
        ],
        "gridLayout": [
            {"i": "w1", "x": 0, "y": 0, "w": 6, "h": 4},
            {"i": "w2", "x": 6, "y": 0, "w": 6, "h": 4}
        ]
    }'::jsonb),
    ('dash-002', 'user-bob-002', 'Actor Network', 'Graph-based actor collaboration insights', false, '{
        "widgets": [
            {
                "id": "w1",
                "chartType": "table",
                "connectionId": "conn-neo4j-001",
                "query": "MATCH (p:Person)-[:DIRECTED]->(m:Movie) RETURN p.name AS director, count(m) AS movies_directed ORDER BY movies_directed DESC LIMIT 10",
                "settings": {"title": "Most Prolific Directors"}
            }
        ],
        "gridLayout": [
            {"i": "w1", "x": 0, "y": 0, "w": 12, "h": 5}
        ]
    }'::jsonb);

-- Seed dashboard share (Alice shares her dashboard with Bob as viewer)
INSERT INTO "dashboard_share" ("id", "dashboardId", "userId", "role") VALUES
    ('share-001', 'dash-001', 'user-bob-002', 'viewer');


-- -------------------------------------------------------
-- 2. Movies database — relational version for PG queries
-- -------------------------------------------------------

CREATE DATABASE movies;

\connect movies

CREATE TABLE movies (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL UNIQUE,
    released INTEGER,
    tagline TEXT
);

CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    born INTEGER
);

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people(id),
    movie_id INTEGER NOT NULL REFERENCES movies(id),
    relationship TEXT NOT NULL, -- ACTED_IN, DIRECTED, PRODUCED, WROTE
    roles TEXT[] -- only for ACTED_IN
);

CREATE INDEX idx_roles_person ON roles(person_id);
CREATE INDEX idx_roles_movie ON roles(movie_id);
CREATE INDEX idx_movies_released ON movies(released);

-- Movies
INSERT INTO movies (title, released, tagline) VALUES
    ('The Matrix', 1999, 'Welcome to the Real World'),
    ('The Matrix Reloaded', 2003, 'Free your mind'),
    ('The Matrix Revolutions', 2003, 'Everything that has a beginning has an end'),
    ('The Devil''s Advocate', 1997, 'Evil has its winning ways'),
    ('A Few Good Men', 1992, 'In the heart of the nation''s capital, in a courthouse of the U.S. government, one man will stop at nothing to keep his honor, and one will stop at nothing to find the truth.'),
    ('Top Gun', 1986, 'I feel the need, the need for speed.'),
    ('Jerry Maguire', 2000, 'The rest of his life begins now.'),
    ('Stand By Me', 1986, 'For some, it''s the last real taste of innocence, and the first real taste of life. But for everyone, it''s the time that memories are made of.'),
    ('As Good as It Gets', 1997, 'A comedy from the heart that goes for the throat.'),
    ('What Dreams May Come', 1998, 'After life there is more. The end is just the beginning.'),
    ('Snow Falling on Cedars', 1999, 'First loves last. Forever.'),
    ('You''ve Got Mail', 1998, 'At odds in life... in love on-line.'),
    ('Sleepless in Seattle', 1993, 'What if someone you never met, someone you never saw, someone you never knew was the only someone for you?'),
    ('Joe Versus the Volcano', 1990, 'A story of love, lava and burning desire.'),
    ('When Harry Met Sally', 1998, 'Can two friends sleep together and still love each other in the morning?'),
    ('That Thing You Do', 1996, 'In every life there comes a time when that thing you dream becomes that thing you do'),
    ('The Replacements', 2000, 'Pain heals, Chicks dig scars... Glory lasts forever'),
    ('RescueDawn', 2006, 'Based on the extraordinary true story of one man''s fight for freedom'),
    ('The Birdcage', 1996, 'Come as you are'),
    ('Unforgiven', 1992, 'It''s a hell of a thing, killing a man'),
    ('Johnny Mnemonic', 1995, 'The hottest data on earth. In the coolest head in town'),
    ('Cloud Atlas', 2012, 'Everything is connected'),
    ('The Da Vinci Code', 2006, 'Break The Codes'),
    ('V for Vendetta', 2006, 'Freedom! Forever!'),
    ('Speed Racer', 2008, 'Speed has no limits'),
    ('Ninja Assassin', 2009, 'Prepare to enter a secret world of assassins'),
    ('The Green Mile', 1999, 'Walk a mile you''ll never forget.'),
    ('Frost/Nixon', 2008, '400 million people were waiting for the truth.'),
    ('Hoffa', 1992, 'He didn''t want law. He wanted justice.'),
    ('Apollo 13', 1995, 'Houston, we have a problem.'),
    ('Twister', 1996, 'Don''t Breathe. Don''t Look Back.'),
    ('Cast Away', 2000, 'At the edge of the world, his journey begins.'),
    ('One Flew Over the Cuckoo''s Nest', 1975, 'If he''s crazy, what does that make you?'),
    ('Something''s Gotta Give', 2003, NULL),
    ('Bicentennial Man', 1999, 'One robot''s 200 year journey to become an ordinary man.'),
    ('Charlie Wilson''s War', 2007, 'A stiff drink. A little mascara. A lot of nerve. Who said they couldn''t bring down the Soviet empire.'),
    ('The Polar Express', 2004, 'This Holiday Season... Believe'),
    ('A League of Their Own', 1992, 'Once in a lifetime you get a chance to do something different.');

-- People
INSERT INTO people (name, born) VALUES
    ('Keanu Reeves', 1964),
    ('Carrie-Anne Moss', 1967),
    ('Laurence Fishburne', 1961),
    ('Hugo Weaving', 1960),
    ('Lilly Wachowski', 1967),
    ('Lana Wachowski', 1965),
    ('Joel Silver', 1952),
    ('Emil Eifrem', 1978),
    ('Charlize Theron', 1975),
    ('Al Pacino', 1940),
    ('Taylor Hackford', 1944),
    ('Tom Cruise', 1962),
    ('Jack Nicholson', 1937),
    ('Demi Moore', 1962),
    ('Kevin Bacon', 1958),
    ('Kiefer Sutherland', 1966),
    ('Noah Wyle', 1971),
    ('Cuba Gooding Jr.', 1968),
    ('Kevin Pollak', 1957),
    ('J.T. Walsh', 1943),
    ('James Marshall', 1967),
    ('Christopher Guest', 1948),
    ('Rob Reiner', 1947),
    ('Aaron Sorkin', 1961),
    ('Kelly McGillis', 1957),
    ('Val Kilmer', 1959),
    ('Anthony Edwards', 1962),
    ('Tom Skerritt', 1933),
    ('Meg Ryan', 1961),
    ('Tony Scott', 1944),
    ('Jim Cash', 1941),
    ('Renee Zellweger', 1969),
    ('Kelly Preston', 1962),
    ('Jerry O''Connell', 1974),
    ('Jay Mohr', 1970),
    ('Bonnie Hunt', 1961),
    ('Regina King', 1971),
    ('Jonathan Lipnicki', 1996),
    ('Cameron Crowe', 1957),
    ('River Phoenix', 1970),
    ('Corey Feldman', 1971),
    ('Wil Wheaton', 1972),
    ('John Cusack', 1966),
    ('Marshall Bell', 1942),
    ('Helen Hunt', 1963),
    ('Greg Kinnear', 1963),
    ('James L. Brooks', 1940),
    ('Annabella Sciorra', 1960),
    ('Max von Sydow', 1929),
    ('Werner Herzog', 1942),
    ('Robin Williams', 1951),
    ('Vincent Ward', 1956),
    ('Ethan Hawke', 1970),
    ('Rick Yune', 1971),
    ('James Cromwell', 1940),
    ('Scott Hicks', 1953),
    ('Parker Posey', 1968),
    ('Dave Chappelle', 1973),
    ('Steve Zahn', 1967),
    ('Tom Hanks', 1956),
    ('Nora Ephron', 1941),
    ('Rita Wilson', 1956),
    ('Bill Pullman', 1953),
    ('Victor Garber', 1949),
    ('Rosie O''Donnell', 1962),
    ('John Patrick Stanley', 1950),
    ('Nathan Lane', 1956),
    ('Billy Crystal', 1948),
    ('Carrie Fisher', 1956),
    ('Bruno Kirby', 1949),
    ('Liv Tyler', 1977),
    ('Brooke Langton', 1970),
    ('Gene Hackman', 1930),
    ('Orlando Jones', 1968),
    ('Howard Deutch', 1950),
    ('Christian Bale', 1974),
    ('Zach Grenier', 1954),
    ('Mike Nichols', 1931),
    ('Richard Harris', 1930),
    ('Clint Eastwood', 1930),
    ('Takeshi Kitano', 1947),
    ('Dina Meyer', 1968),
    ('Ice-T', 1958),
    ('Robert Longo', 1953),
    ('Halle Berry', 1966),
    ('Jim Broadbent', 1949),
    ('Tom Tykwer', 1965),
    ('David Mitchell', 1969),
    ('Stefan Arndt', 1961),
    ('Ian McKellen', 1939),
    ('Audrey Tautou', 1976),
    ('Paul Bettany', 1971),
    ('Ron Howard', 1954),
    ('Natalie Portman', 1981),
    ('Stephen Rea', 1946),
    ('John Hurt', 1940),
    ('Ben Miles', 1967),
    ('Emile Hirsch', 1985),
    ('John Goodman', 1960),
    ('Susan Sarandon', 1946),
    ('Matthew Fox', 1966),
    ('Christina Ricci', 1980),
    ('Rain', 1982),
    ('Naomie Harris', NULL),
    ('Michael Clarke Duncan', 1957),
    ('David Morse', 1953),
    ('Sam Rockwell', 1968),
    ('Gary Sinise', 1955),
    ('Patricia Clarkson', 1959),
    ('Frank Darabont', 1959),
    ('Frank Langella', 1938),
    ('Michael Sheen', 1969),
    ('Oliver Platt', 1960),
    ('Danny DeVito', 1944),
    ('John C. Reilly', 1965),
    ('Ed Harris', 1950),
    ('Bill Paxton', 1955),
    ('Philip Seymour Hoffman', 1967),
    ('Jan de Bont', 1943),
    ('Robert Zemeckis', 1951),
    ('Milos Forman', 1932),
    ('Diane Keaton', 1946),
    ('Nancy Meyers', 1949),
    ('Chris Columbus', 1958),
    ('Julia Roberts', 1967),
    ('Madonna', 1954),
    ('Geena Davis', 1956),
    ('Lori Petty', 1963),
    ('Penny Marshall', 1943);

-- Roles (ACTED_IN, DIRECTED, PRODUCED, WROTE)
-- Using subqueries to reference by name for readability
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Neo'] FROM people p, movies m WHERE p.name='Keanu Reeves' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Trinity'] FROM people p, movies m WHERE p.name='Carrie-Anne Moss' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Morpheus'] FROM people p, movies m WHERE p.name='Laurence Fishburne' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Agent Smith'] FROM people p, movies m WHERE p.name='Hugo Weaving' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Joel Silver' AND m.title='The Matrix';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Emil'] FROM people p, movies m WHERE p.name='Emil Eifrem' AND m.title='The Matrix';

-- Matrix Reloaded
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Neo'] FROM people p, movies m WHERE p.name='Keanu Reeves' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Trinity'] FROM people p, movies m WHERE p.name='Carrie-Anne Moss' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Morpheus'] FROM people p, movies m WHERE p.name='Laurence Fishburne' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Agent Smith'] FROM people p, movies m WHERE p.name='Hugo Weaving' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='The Matrix Reloaded';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Joel Silver' AND m.title='The Matrix Reloaded';

-- Matrix Revolutions
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Neo'] FROM people p, movies m WHERE p.name='Keanu Reeves' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Trinity'] FROM people p, movies m WHERE p.name='Carrie-Anne Moss' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Morpheus'] FROM people p, movies m WHERE p.name='Laurence Fishburne' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Agent Smith'] FROM people p, movies m WHERE p.name='Hugo Weaving' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='The Matrix Revolutions';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Joel Silver' AND m.title='The Matrix Revolutions';

-- The Devil's Advocate
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Kevin Lomax'] FROM people p, movies m WHERE p.name='Keanu Reeves' AND m.title='The Devil''s Advocate';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Mary Ann Lomax'] FROM people p, movies m WHERE p.name='Charlize Theron' AND m.title='The Devil''s Advocate';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['John Milton'] FROM people p, movies m WHERE p.name='Al Pacino' AND m.title='The Devil''s Advocate';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Taylor Hackford' AND m.title='The Devil''s Advocate';

-- A Few Good Men
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Lt. Daniel Kaffee'] FROM people p, movies m WHERE p.name='Tom Cruise' AND m.title='A Few Good Men';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Col. Nathan R. Jessup'] FROM people p, movies m WHERE p.name='Jack Nicholson' AND m.title='A Few Good Men';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Lt. Cdr. JoAnne Galloway'] FROM people p, movies m WHERE p.name='Demi Moore' AND m.title='A Few Good Men';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Capt. Jack Ross'] FROM people p, movies m WHERE p.name='Kevin Bacon' AND m.title='A Few Good Men';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Rob Reiner' AND m.title='A Few Good Men';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='Aaron Sorkin' AND m.title='A Few Good Men';

-- Top Gun
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Maverick'] FROM people p, movies m WHERE p.name='Tom Cruise' AND m.title='Top Gun';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Charlie'] FROM people p, movies m WHERE p.name='Kelly McGillis' AND m.title='Top Gun';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Iceman'] FROM people p, movies m WHERE p.name='Val Kilmer' AND m.title='Top Gun';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Tony Scott' AND m.title='Top Gun';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='Jim Cash' AND m.title='Top Gun';

-- Jerry Maguire
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Jerry Maguire'] FROM people p, movies m WHERE p.name='Tom Cruise' AND m.title='Jerry Maguire';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Rod Tidwell'] FROM people p, movies m WHERE p.name='Cuba Gooding Jr.' AND m.title='Jerry Maguire';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Dorothy Boyd'] FROM people p, movies m WHERE p.name='Renee Zellweger' AND m.title='Jerry Maguire';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Cameron Crowe' AND m.title='Jerry Maguire';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Cameron Crowe' AND m.title='Jerry Maguire';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='Cameron Crowe' AND m.title='Jerry Maguire';

-- Tom Hanks movies (selected key roles)
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Joe Fox'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='You''ve Got Mail';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Sam Baldwin'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Sleepless in Seattle';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Joe Banks'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Joe Versus the Volcano';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Mr. White'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='That Thing You Do';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='That Thing You Do';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Zachry','Dr. Henry Goose','Isaac Sachs','Dermot Hoggins'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Cloud Atlas';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Dr. Robert Langdon'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='The Da Vinci Code';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Paul Edgecomb'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='The Green Mile';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Jim Lovell'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Apollo 13';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Chuck Noland'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Cast Away';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Rep. Charlie Wilson'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='Charlie Wilson''s War';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Hero Boy','Father','Conductor','Hobo','Scrooge','Santa Claus'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='The Polar Express';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'ACTED_IN', ARRAY['Jimmy Dugan'] FROM people p, movies m WHERE p.name='Tom Hanks' AND m.title='A League of Their Own';

-- Directors for remaining movies
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Nora Ephron' AND m.title='You''ve Got Mail';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Nora Ephron' AND m.title='Sleepless in Seattle';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Rob Reiner' AND m.title='When Harry Met Sally';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Rob Reiner' AND m.title='Stand By Me';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='James L. Brooks' AND m.title='As Good as It Gets';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Vincent Ward' AND m.title='What Dreams May Come';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Scott Hicks' AND m.title='Snow Falling on Cedars';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Howard Deutch' AND m.title='The Replacements';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Werner Herzog' AND m.title='RescueDawn';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Mike Nichols' AND m.title='The Birdcage';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Clint Eastwood' AND m.title='Unforgiven';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Robert Longo' AND m.title='Johnny Mnemonic';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Ron Howard' AND m.title='The Da Vinci Code';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Ron Howard' AND m.title='Frost/Nixon';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Ron Howard' AND m.title='Apollo 13';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='James Marshall' AND m.title='V for Vendetta';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='James Marshall' AND m.title='Ninja Assassin';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Frank Darabont' AND m.title='The Green Mile';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Danny DeVito' AND m.title='Hoffa';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Jan de Bont' AND m.title='Twister';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Robert Zemeckis' AND m.title='Cast Away';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Robert Zemeckis' AND m.title='The Polar Express';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Milos Forman' AND m.title='One Flew Over the Cuckoo''s Nest';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Nancy Meyers' AND m.title='Something''s Gotta Give';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Chris Columbus' AND m.title='Bicentennial Man';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Mike Nichols' AND m.title='Charlie Wilson''s War';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Penny Marshall' AND m.title='A League of Their Own';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='John Patrick Stanley' AND m.title='Joe Versus the Volcano';

-- Cloud Atlas directors/writers/producers
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Tom Tykwer' AND m.title='Cloud Atlas';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='Cloud Atlas';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='Cloud Atlas';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='David Mitchell' AND m.title='Cloud Atlas';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Stefan Arndt' AND m.title='Cloud Atlas';

-- Speed Racer
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='Speed Racer';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'DIRECTED', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='Speed Racer';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='Lilly Wachowski' AND m.title='Speed Racer';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'WROTE', NULL FROM people p, movies m WHERE p.name='Lana Wachowski' AND m.title='Speed Racer';
INSERT INTO roles (person_id, movie_id, relationship, roles) SELECT p.id, m.id, 'PRODUCED', NULL FROM people p, movies m WHERE p.name='Joel Silver' AND m.title='Speed Racer';

-- Grant read access to the neoboard user on the movies database
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO neoboard;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO neoboard;
