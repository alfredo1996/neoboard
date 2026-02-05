export { ConnectionContext } from './generalized/uiComponents/ConnectionContext';
export { DEFAULT_CONNECTION_CONFIG, DEFAULT_AUTHENTICATION_CONFIG, AuthType } from './generalized/interfaces';
export { Neo4jConnectionModule } from './neo4j/Neo4jConnectionModule';
export { PostgresConnectionModule } from './postgresql/PostgresConnectionModule';
// @ts-ignore
export { ConnectionProvider } from './generalized/uiComponents/ConnectionProvider';
export { QueryStatus } from './generalized/interfaces';
export { createConnectionModule, getConnectionTypeName, getSupportedConnectionTypes } from './adapters/factory';
export { ConnectionTypes } from './ConnectionModuleConfig';

///Specific Neo4j Date types necessary for Neodash
//TODO: fix it and create specific date types

// @ts-ignore
export { Date as Neo4jDate } from 'neo4j-driver-core/lib/temporal-types.js';
// @ts-ignore
export { READ, WRITE } from 'neo4j-driver-core/lib/driver.js';
// @ts-ignore
export { isNode } from 'neo4j-driver-core/lib/graph-types.js';
// @ts-ignore
export { ConnectionModule } from './generalized/ConnectionModule';
/// Types
export type { ConnectionContextState } from './generalized/uiComponents/ConnectionContext';
export type { AuthConfig } from './generalized/interfaces';
