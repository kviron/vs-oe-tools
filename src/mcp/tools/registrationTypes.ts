import type { McpToolServer } from '../toolTypes';

/** Stable catalog position retained from the public registration sequence.
 * Gaps allow additions without renumbering other domains.
 */
export type OrderedToolRegistration = readonly [order: number, register: (server: McpToolServer) => void];
