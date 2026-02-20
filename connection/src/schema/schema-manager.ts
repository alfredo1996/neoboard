import type { AuthConfig } from '../generalized/interfaces';
import type { DatabaseSchema } from './types';

export interface SchemaManager {
  fetchSchema(authConfig: AuthConfig): Promise<DatabaseSchema>;
}
