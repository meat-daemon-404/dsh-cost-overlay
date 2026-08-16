/**
 * Protocol constants shared by the host routes and the browser client.
 * Only the recompute trigger crosses the wire (loopback-only).
 */

/** POST /api/dsh-cost-overlay/recompute -> { ok: true } after re-registering the projection. */
export const RECOMPUTE_PATH = '/api/dsh-cost-overlay/recompute'

/** Recompute route response body. */
export interface RecomputeResponse {
  ok: boolean
  /** Registered projection count after the rebuild (diagnostics). */
  registered: number
}
