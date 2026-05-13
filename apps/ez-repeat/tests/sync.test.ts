import test from 'node:test';
import assert from 'node:assert/strict';
import { getRepeatSyncNotice, type RepeatSyncResult } from '../src/lib/repeat/sync.ts';

const noChanges: RepeatSyncResult = {
	habitsPushed: 0,
	habitsPulled: 0,
	completionsPushed: 0,
	completionsPulled: 0
};

test('repeat sync notice is shown when remote changes are pulled', () => {
	assert.equal(
		getRepeatSyncNotice({
			...noChanges,
			habitsPulled: 1
		}),
		'Sync complete'
	);
	assert.equal(
		getRepeatSyncNotice({
			...noChanges,
			completionsPulled: 2
		}),
		'Sync complete'
	);
});

test('repeat sync notice keeps manual success copy for non-pull syncs', () => {
	assert.equal(getRepeatSyncNotice(noChanges), null);
	assert.equal(
		getRepeatSyncNotice(noChanges, { showSuccessNotice: true }),
		'Sync complete (no changes)'
	);
	assert.equal(
		getRepeatSyncNotice(
			{
				...noChanges,
				habitsPushed: 1
			},
			{ showSuccessNotice: true }
		),
		'Sync complete'
	);
});
