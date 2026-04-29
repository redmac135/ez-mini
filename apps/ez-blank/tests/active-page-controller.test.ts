import test from 'node:test';
import assert from 'node:assert/strict';
import { createActivePageController } from '../src/lib/editor/active-page-controller.ts';

class FakeTimer {
	private now = 0;
	private nextId = 1;
	private scheduled = new Map<number, { dueAt: number; callback: () => void }>();

	setTimeout(callback: () => void, delayMs: number) {
		const id = this.nextId++;
		this.scheduled.set(id, {
			dueAt: this.now + delayMs,
			callback
		});
		return id as unknown as ReturnType<typeof setTimeout>;
	}

	clearTimeout(handle: ReturnType<typeof setTimeout>) {
		this.scheduled.delete(handle as unknown as number);
	}

	advanceBy(ms: number) {
		this.now += ms;
		for (const [id, task] of [...this.scheduled.entries()].sort(
			(left, right) => left[1].dueAt - right[1].dueAt
		)) {
			if (task.dueAt <= this.now) {
				this.scheduled.delete(id);
				task.callback();
			}
		}
	}
}

function createDeferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((nextResolve) => {
		resolve = nextResolve;
	});
	return { promise, resolve };
}

test('active page push debounces to the last scheduled page', async () => {
	const timer = new FakeTimer();
	const pushedPageIds: string[] = [];
	const controller = createActivePageController({
		delayMs: 300,
		timer,
		runPush: async (pageId) => {
			pushedPageIds.push(pageId);
		}
	});

	controller.schedule('page-a');
	timer.advanceBy(200);
	controller.schedule('page-b');
	timer.advanceBy(299);
	await Promise.resolve();
	assert.deepEqual(pushedPageIds, []);

	timer.advanceBy(1);
	await Promise.resolve();
	assert.deepEqual(pushedPageIds, ['page-b']);
});

test('active page push queues the latest page while a push is in flight', async () => {
	const timer = new FakeTimer();
	const firstPush = createDeferred();
	const pushedPageIds: string[] = [];
	let pushCount = 0;
	const controller = createActivePageController({
		delayMs: 300,
		timer,
		runPush: async (pageId) => {
			pushedPageIds.push(pageId);
			pushCount += 1;
			if (pushCount === 1) {
				await firstPush.promise;
			}
		}
	});

	controller.requestImmediate('page-a');
	await Promise.resolve();
	controller.requestImmediate('page-b');
	controller.requestImmediate('page-c');
	await Promise.resolve();
	assert.deepEqual(pushedPageIds, ['page-a']);

	firstPush.resolve();
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(pushedPageIds, ['page-a', 'page-c']);
});

test('active page push ignores duplicate pending or in-flight page ids', async () => {
	const firstPush = createDeferred();
	const pushedPageIds: string[] = [];
	const controller = createActivePageController({
		delayMs: 300,
		runPush: async (pageId) => {
			pushedPageIds.push(pageId);
			await firstPush.promise;
		}
	});

	controller.requestImmediate('page-a');
	await Promise.resolve();
	controller.requestImmediate('page-a');
	controller.requestImmediate('page-a');
	firstPush.resolve();
	await Promise.resolve();
	await Promise.resolve();
	assert.deepEqual(pushedPageIds, ['page-a']);
});
