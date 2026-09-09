import * as assert from 'node:assert/strict';
import { classObjectColumnSettingsKey, normalizeClassObjectColumnSettings } from '../features/classes/classObjectColumnSettings';

suite('Class object column settings', () => {
	test('uses a separate workspace key for every dictionary class', () => {
		assert.equal(classObjectColumnSettingsKey(10), 'vcVeTools.classObjectColumnSettings.10');
		assert.notEqual(classObjectColumnSettingsKey(10), classObjectColumnSettingsKey(11));
	});

	test('restores visibility, order and compact mode', () => {
		assert.deepEqual(normalizeClassObjectColumnSettings(['id', 'name', 'code'], {
			visible: ['code', 'id'],
			order: ['code', 'name', 'id'],
			compact: false,
		}), {
			visible: ['code', 'id'],
			order: ['code', 'name', 'id'],
			compact: false,
		});
	});

	test('shows newly added fields while discarding removed fields', () => {
		assert.deepEqual(normalizeClassObjectColumnSettings(['id', 'name', 'newField'], {
			visible: ['id', 'removed'],
			order: ['name', 'id', 'removed'],
			compact: true,
		}), {
			visible: ['id', 'newField'],
			order: ['name', 'id', 'newField'],
			compact: true,
		});
	});

	test('never allows a non-empty dictionary to hide every column', () => {
		assert.deepEqual(normalizeClassObjectColumnSettings(['id', 'name'], {
			visible: [],
			order: ['id', 'name'],
			compact: true,
		}).visible, ['id']);
	});
});
