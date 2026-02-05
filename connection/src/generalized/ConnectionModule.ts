import { AuthenticationModule } from './AuthenticationModule';
import { ConnectionConfig, QueryCallback, QueryParams } from './interfaces';

export abstract class ConnectionModule {
  abstract authModule: AuthenticationModule;

  protected constructor() {}

  abstract runQuery<T>(queryParams: QueryParams, callbacks: QueryCallback<T>, config: ConnectionConfig): Promise<void>;

  abstract checkConnection(connectionConfig: ConnectionConfig): Promise<boolean>;
}
