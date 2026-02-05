# Neo4j Connection Module

This module provides a complete abstraction layer over the official `neo4j-driver`, enabling seamless interaction with a Neo4j database.  
It is designed to simplify authentication, transactional Cypher query execution, and parsing of Neo4j records into native JavaScript objects.

It is intended for use in backend applications or data-processing tools that require robust and structured access to a Neo4j graph database.

## Features

- Supports authentication via username/password (native auth)
- Initializes and manages a Neo4j `Driver` instance
- Executes Cypher queries with automatic session and transaction handling
- Allows both `READ` and `WRITE` access modes
- Provides structured query lifecycle status updates (`QueryStatus`)
- Parses Neo4j records into native JavaScript objects with type mapping
- Handles Neo4j-specific types such as `Integer`, `DateTime`, `Node`, `Point`, and `Duration`
- Supports safe fallback to `bigint` for large integers
- Offers extensible callback-based API (`onSuccess`, `onFail`, `setStatus`)

## Table of Contents

1. [Overview](#neo4j-connection-module)
2. [Features](#features)
3. [Table of Contents](#table-of-contents)
4. [Architecture](#architecture)
5. [Configuration](#configuration)
6. [Query Execution](#query-execution)
7. [Record Parsing](#record-parsing)
8. [Usage Examples](#usage-examples)
9. [Error Handling and QueryStatus](#error-handling-and-querystatus)

## Architecture

The module is organized into three main components, each with a clear responsibility:

### 1. Neo4jAuthenticationModule

- Initializes a Neo4j `Driver` instance using the provided authentication configuration.
- Supports basic authentication (`username`, `password`) and prepares for future SSO support.
- Verifies connectivity and credentials via `verifyAuthentication()`.

### 2. Neo4jConnectionModule

- Manages query execution through transactions in either `READ` or `WRITE` mode.
- Accepts Cypher queries and parameters, and supports lifecycle callbacks.
- Uses `QueryStatus` to report status changes (e.g., `RUNNING`, `COMPLETE`, `ERROR`).
- Automatically handles connection timeout and result truncation.

### 3. Neo4jRecordParser

- Converts Neo4j result records (`Record`) into native JavaScript objects.
- Handles Neo4j-specific types like `Integer`, `DateTime`, `Point`, `Node`, and nested arrays.
- Returns structured objects via a uniform interface (`NeodashRecord`).

## Configuration

The module requires two main configuration objects to establish a connection and execute queries.

### AuthConfig

Defines how the module authenticates with the Neo4j database.

```
interface AuthConfig {
  username: string;
  password: string;
  authType: AuthType; // e.g., NATIVE or EMPTY
  uri: string;        // e.g., "bolt://localhost:7687"
}
```

#### Example

```
const authConfig = {
  username: 'neo4j',
  password: 'password',
  authType: AuthType.NATIVE,
  uri: 'bolt://localhost:7687'
};
```

---

### ConnectionConfig

Controls query behavior, timeout settings, access mode, and result limits.

```
interface ConnectionConfig {
  accessMode: READ | WRITE;        // READ for read-only queries, WRITE for mutations
  timeout: number;                 // Query execution timeout (ms)
  connectionTimeout: number;      // Timeout for establishing the initial connection (ms)
  database: string;               // Database name, typically "neo4j"
  rowLimit: number;               // Max number of rows before truncation occurs
  connectionType: string;         // Descriptive type, e.g., "neo4j"
}
```

#### Example

```
const connectionConfig = {
  accessMode: READ,
  timeout: 2000,
  connectionTimeout: 30000,
  database: 'neo4j',
  rowLimit: 5000,
  connectionType: 'neo4j'
};
```

## Query Execution

The core method to run Cypher queries is `runQuery`, exposed by the `Neo4jConnectionModule`.

It supports full query lifecycle management, including status updates, transaction handling, and result truncation based on configuration.

### Method Signature

```
runQuery<T>(
  queryParams: CypherQueryParams,
  callbacks: CypherQueryCallback<T>,
  config: ConnectionConfig
): Promise<void>
```

### Callbacks

- `onSuccess(result: T)`: called when the query completes successfully
- `onFail(error: any)`: called when the query throws an error
- `setStatus(status: QueryStatus)`: optional; updates the query status (`RUNNING`, `COMPLETE`, etc.)

### Example

```
await connection.runQuery(
  { query: 'MATCH (n) RETURN n LIMIT 10', params: {} },
  {
    onSuccess: (records) => console.log('Results:', records),
    onFail: (err) => console.error('Query failed:', err),
    setStatus: (status) => console.log('Status:', status)
  },
  connectionConfig
);
```

---

## Record Parsing

`Neo4jRecordParser` is responsible for converting Neo4j result records into native and accessible JavaScript objects.  
It is designed to recursively process every Cypher-returned value and transform it into a format compatible with native JS usage.  
As agreed, this is based on the official Neo4j JavaScript driver specifications:  
https://neo4j.com/docs/javascript-manual/current/data-types/

### Parsing Strategy

The parser handles data conversion based on three main categories of Cypher data:

---

### 1. Primitives

These include:

- Neo4j `Integer` (custom type)
- JavaScript native types: `boolean`, `string`, `number`

**How it's handled**:
- `Integer` values are checked for safe numeric range: if safe, converted with `toNumber()`, otherwise with `toBigInt()`
- Native JS primitives are returned as-is

→ Implemented by `parsePrimitive()`

---

### 2. Temporal Types

These include:

- `Date`, `Time`, `LocalTime`
- `DateTime`, `LocalDateTime`
- `Duration`

**How it's handled**:
- Converted into `Date` objects or formatted strings
- `Duration` is transformed into a native JS object with `months`, `days`, `seconds`, and `nanoseconds`

→ Implemented by `parseTemporal()`

---

### 3. Graph and Complex Types

> Note: Node, Relationship, Path, and PathSegment are returned exactly as provided by the Neo4j driver.  
> This allows consumers to retain access to methods like `.identity`, `.labels`, and `.properties`, without custom flattening.  
> Only `Point` objects are converted into a native JavaScript object to expose coordinates directly.

These include:

- `Node`, `Relationship`, `Path`, `PathSegment`
- `Point` (spatial type)

**How it's handled**:
- Most are returned as-is (Neo4j objects), except for `Point`, which is mapped to an object with `x`, `y`, `z?`, `srid`

→ Implemented by `parseGraphObject()`

---

### Type Mapping Summary

| Cypher Type          | JavaScript Equivalent                            |
|----------------------|--------------------------------------------------|
| Integer              | `number` or `bigint`                             |
| Date, DateTime       | JS `Date` or ISO `string`                        |
| Time, LocalTime      | `string` formatted as time with optional offset |
| Duration             | `{ months, days, seconds, nanoseconds }` object |
| Node, Relationship   | Returned as-is (Neo4j object)                    |
| Point                | `{ x, y, z?, srid }`                             |
| List / Map           | Recursively parsed into Array/Object            |

---

### Example Usage

```ts
const parser = new Neo4jRecordParser();
const parsed = parser.bulkParse(records);
console.log(parsed[0].movie.title); // e.g., "The Matrix"
```

---

## Usage Examples

This section demonstrates how to combine all modules to perform a typical query and parse the result.

### Full Example

```ts
import {
   Neo4jAuthenticationModule,
   Neo4jConnectionModule,
   Neo4jRecordParser
} from './your-module-path';

const authConfig = {
   username: 'neo4j',
   password: 'password',
   authType: AuthType.NATIVE,
   uri: 'bolt://localhost:7687'
};

const connectionConfig = {
   accessMode: READ,
   timeout: 2000,
   connectionTimeout: 30000,
   database: 'neo4j',
   rowLimit: 5000,
   connectionType: 'neo4j'
};

const connection = new Neo4jConnectionModule(authConfig);
const parser = new Neo4jRecordParser();

await connection.runQuery(
        { query: 'MATCH (m:Movie) RETURN m', params: {} },
        {
           onSuccess: (records) => {
              const parsed = parser.bulkParse(records);
              console.log(parsed[0].m.title); // The Matrix
           },
           onFail: (err) => console.error('Query failed:', err),
           setStatus: (status) => console.log('Status:', status)
        },
        connectionConfig
);
```

---

## Error Handling and QueryStatus

The module supports structured query lifecycle reporting using the `QueryStatus` enum.

### QueryStatus Enum

```
enum QueryStatus {
  NO_DATA,
  RUNNING,
  TIMED_OUT,
  COMPLETE,
  COMPLETE_TRUNCATED,
  ERROR
}
```

### Usage

- `RUNNING` is set when a query starts.
- `COMPLETE` is set on success.
- `COMPLETE_TRUNCATED` if the result exceeds `rowLimit`.
- `NO_DATA` if the query returns an empty result set.
- `TIMED_OUT` if the query exceeds the configured timeout.
- `ERROR` for any other failure.

### Best Practices for Error Handling

- Use `setStatus` to track state changes.
- Use `_isErrorWithMessage(err)` type guard to safely access `err.message`.
- Handle large result sets by respecting `rowLimit`.