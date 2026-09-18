import * as assert from 'node:assert/strict';
import { validatePackageBindingMutationRequest } from '../features/package-sync/packageBindingMutation';

suite('Package binding mutation guard', () => {
	test('accepts an atomic binding to a template object', () => {
		assert.doesNotThrow(() => validatePackageBindingMutationRequest({
			objectIds: [3200234, 10826482], templateObjectId: 10826480,
			expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
		}));
	});

	test('requires exactly one concrete target', () => {
		assert.throws(() => validatePackageBindingMutationRequest({
			objectIds: [3200234], expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
		}), /ровно одну цель/);
		assert.throws(() => validatePackageBindingMutationRequest({
			objectIds: [3200234], templateObjectId: 10826480, sysFileId: 15994496,
			expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
		}), /ровно одну цель/);
	});

	test('rejects duplicate or invalid object IDs', () => {
		assert.throws(() => validatePackageBindingMutationRequest({
			objectIds: [3200234, 3200234], sysFileId: 15994496,
			expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
		}), /повторяющиеся/);
		assert.throws(() => validatePackageBindingMutationRequest({
			objectIds: [], sysFileId: 15994496,
			expectedDatabase: 'oetrunk', expectedHost: 'localhost', expectedPort: 5432,
		}), /от 1 до 100/);
	});
});
