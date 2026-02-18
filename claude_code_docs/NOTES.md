tasks that must be done in the future. please first fix bugs and then new features, unless there is a new feature impacting a bug, then understand what is the best order of execution (it does not make sense to fix a bug ofsomething you'll change.)

let's plan these activies without writing any code:

1. i want to start thinking of paraemter selectors and how we can store them during a session/when saving the dashboard. the parameter selection during the card creation, please take a look at neodash report action to understand more and other dahsboarding oss projects interactivity. propose a solution in a specific document. for example, clicking on a specific cell sets that property in the parameter store, or clicking on a dot on the map chart or clicking on a bar chart. Parameters should have a small modal UI where you can delete/reset them.

2. i want specific code editors for each connector, using the styling for each language. I want also that, for each connection, we can fetch the schema of the database, we should understand easiest way to do it, propose solution. ideally i would like having the schema of each database

3. i want to start thinking about migrating neodash dashboards to arrive to a point where this project is substituting the official one. https://neo4j.com/docs/neodash-commercial/current/, take a look at the chart, what are we missing, what is redundant, etc...

4. i want a form chart to push data to its connection, it should be in the chart repository, in the settings there is a query in which you can define the push to db logic (as a single query). forms should be backed by paraemter fields (dates, text, etc...).

5. https://github.com/anthropics/skills/tree/main/skills, find the right skills for making UX, is there a way to define FIGMAs for this project? i also want to find a meaningful color palette for the application, something nice that makes it look great.

6. dashboard selection should have the options (edit, delete) in the same way as the card.-

7. i want an option to see dashboard metadata (latest update, updator, owner), think about data model changes to adapt and what are the possible useful properties in metadata.

8. i want the capability to export/load dahsboard usign a JSON file, what is needed and how can we implement it? It should also say which kind of connectors you need (maybe linked with the connection ID? Something like either you use the EXACT same connectors OR bring you own connectors, so we can link them through the type. third option could be not attach connectors and do it by hand for now, takes some time (maybe a modal with a table to simplify it?))

9. connector errorws should be visible (maybe hovering on the error icon on the connectors list)

10. a dashboard should have pages, each page does have a title and a set of cards (so what we currently have, but with tabs for the pages)

11. using the query: -- Example: Search for "active" records across two templates (projects and tasks)
    -- with related fields, returning JSON result

SELECT jsonb_build_object(
'AND', jsonb_build_array(
-- globalSearch term
'active',
jsonb_build_object(
'OR', jsonb_build_array(
-- templateId1: projects
jsonb_build_object(
'projects', jsonb_build_object(
'AND', jsonb_build_array(
jsonb_build_object('name', 'Website Redesign'),
jsonb_build_object('status', 'in_progress'),
jsonb_build_object('assigned_team', jsonb_build_object('templateId', 'teams', 'value', 'engineering'))
)
)
),
-- templateId2: tasks
jsonb_build_object(
'tasks', jsonb_build_object(
'AND', jsonb_build_array(
jsonb_build_object('title', 'Fix login bug'),
jsonb_build_object('priority', 'high'),
jsonb_build_object('parent_project', jsonb_build_object('templateId', 'projects', 'value', 'Website Redesign'))
)
)
)
)
)
)
) AS search_query;, i can see the whole result from postgres (the one we receive back from the connection library, users should only see the result, not the metadata of the run of that query)