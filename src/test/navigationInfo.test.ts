import * as assert from 'node:assert/strict';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { getNavigationInfoPath } from '../core/navigationInfo';

suite('Navigation info path', () => {
	test('is stable for the same workspace and isolated between workspaces', () => {
		const first = getNavigationInfoPath('C:\\OE\\trunk');
		assert.equal(first, getNavigationInfoPath('C:\\OE\\trunk'));
		assert.notEqual(first, getNavigationInfoPath('C:\\OE\\other'));
		assert.ok(dirname(first).startsWith(tmpdir()));
	});
});
