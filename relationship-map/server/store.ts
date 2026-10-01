import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMapStore } from '../../src/features/relationship-maps/store';
const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.basename(path.dirname(here)) === 'dist' ? path.resolve(here, '../..') : path.resolve(here, '..');
const store = createMapStore(path.resolve(process.env.RELATIONSHIP_MAP_DIR || process.env.PLUGIN_DATA || path.join(projectRoot, 'maps')));
export const { listMaps, readMap, saveMap, changesSince } = store;
