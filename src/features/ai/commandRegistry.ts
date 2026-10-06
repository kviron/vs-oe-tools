import { composeCommands } from './command';
import { commands as classCommands } from '../classes/commands';
import { commands as methodCommands } from '../methods/commands';
import { commands as moduleCommands } from '../modules/commands';
import { commands as packageCommands } from '../package-sync/commands';
import { commands as lifecycleCommands } from '../lifecycle/commands';
import { commands as httpCommands } from '../settings/commands';
import { commands as codeHistoryCommands } from '../code-history/commands';
import { commands as productionTaskCommands } from '../production-tasks/commands';
import { commands as projectCommands } from '../project/commands';
import { commands as relationshipMapCommands } from '../relationship-maps/commands';
import { commands as assistantCommands } from './commands';

/** Composition only; each feature owns schemas and command invocation. */
export const commandRegistry = composeCommands(
	classCommands,
	methodCommands,
	moduleCommands,
	packageCommands,
	lifecycleCommands,
	httpCommands,
	codeHistoryCommands,
	productionTaskCommands,
	projectCommands,
	relationshipMapCommands,
	assistantCommands,
);
