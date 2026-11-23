// @locs-version: 1.0
import localRouterRefreshSql from "@/lib/local-router-refresh.sql?raw";
import {
  localRouterProjectionHealth as localRouterProjectionHealthCore,
  refreshLocalRouterDerivedStateIfStale as refreshLocalRouterDerivedStateIfStaleCore,
  splitSqlStatements,
  type LocalRouterProjectionHealth,
  type QueryableDb,
} from "@/lib/localRouterProjectorCore";

export { splitSqlStatements };
export type { LocalRouterProjectionHealth, QueryableDb };

export async function refreshLocalRouterDerivedStateIfStale(
  db: QueryableDb,
  options?: {
    force?: boolean;
  },
): Promise<boolean> {
  return refreshLocalRouterDerivedStateIfStaleCore(db, localRouterRefreshSql, options);
}

export async function localRouterProjectionHealth(db: QueryableDb): Promise<LocalRouterProjectionHealth> {
  return localRouterProjectionHealthCore(db);
}
