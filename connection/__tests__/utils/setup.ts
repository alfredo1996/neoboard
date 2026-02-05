import { AuthType } from '../../src';
import { GenericContainer, Wait } from 'testcontainers';
import fs from 'fs';
import path from 'path';
import neo4j from 'neo4j-driver';

/**
 * Loads and executes the movies.cypher dataset into the given Neo4j session.
 */
export async function loadMoviesDataset(uri: string, username: string, password: string) {
  const driver = neo4j.driver(uri, neo4j.auth.basic(username, password));
  const session = driver.session();

  const cypherScript = fs.readFileSync(path.join(__dirname, 'movies.cypher'), 'utf-8');
  const statements = cypherScript.split(/;\s*\n/);

  for (const stmt of statements) {
    if (stmt.trim()) {
      await session.run(stmt);
    }
  }

  await session.close();
  await driver.close();
}

export function createNeo4jRuntimeFile(container) {
  const host = container.getHost(); // Get the host
  const boltPort = container.getMappedPort(7687); // Get the mapped bolt port
  const uri = `bolt://${host}:${boltPort}`;
  const containerId = container.getId();

  const config = { uri, username: 'neo4j', password: 'test', authType: AuthType.NATIVE, containerId };
  fs.writeFileSync(path.join(__dirname, 'neo4j-runtime.json'), JSON.stringify(config));
}

export function getNeo4jAuth() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'neo4j-runtime.json'), 'utf-8'));
  return {
    authType: data.authType,
    username: data.username,
    password: data.password,
    uri: data.uri,
  };
}

export default async () => {
  // Start Neo4j container (without wait strategy)
  let container = await new GenericContainer('neo4j:2025.06-enterprise') // Use a specific version tag for optimized images
    .withEnvironment({
      NEO4J_AUTH: 'neo4j/test',
      NEO4J_ACCEPT_LICENSE_AGREEMENT: 'yes',
      NEO4J_dbms_security_auth__minimum__password__length: '4',
    }) // Accept the license agreement
    .withExposedPorts(7687) // Expose the bolt port
    .withWaitStrategy(
      Wait.forLogMessage('Remote interface available at') // ✅ Neo4j logs this when ready
    )
    .withReuse()
    .start();

  createNeo4jRuntimeFile(container); // Create the runtime file
  const uri = `bolt://${container.getHost()}:${container.getMappedPort(7687)}`;

  await loadMoviesDataset(uri, 'neo4j', 'test');
};
