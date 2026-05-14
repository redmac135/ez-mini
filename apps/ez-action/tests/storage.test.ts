import test from 'node:test';
import assert from 'node:assert/strict';
import { ActionStorage } from '../src/lib/action/storage';
import { createTaskRecord, makeParsedTask } from '../src/lib/action/controller';

test('memory storage saves and reloads local tasks', async () => {
	ActionStorage.resetForTests();
	const task = createTaskRecord(makeParsedTask('Local task'), null);
	await ActionStorage.putTask(task);
	const snapshot = await ActionStorage.loadSnapshot(task.userId);
	assert.equal(snapshot.tasks.length, 1);
	assert.equal(snapshot.tasks[0]?.title, 'Local task');
});
