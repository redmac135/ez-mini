import { ANONYMOUS_USER_ID, type StoredJourneyEntry } from '../journey';
import { JourneyStorage } from './storage';

export async function seedJourneyDemoData() {
	if (!import.meta.env.DEV) return;
	const existing = await JourneyStorage.loadEntries(null);
	if (existing.length > 0) return;
	const now = new Date();
	const entries = Array.from({ length: 120 }, (_, index): StoredJourneyEntry => {
		const date = new Date(now);
		date.setDate(date.getDate() - index);
		date.setHours(8 + ((index * 7) % 12), (index * 13) % 60, 0, 0);
		const timestamp = date.toISOString();
		return {
			id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
			userId: ANONYMOUS_USER_ID,
			text: demoText(index),
			createdAt: timestamp,
			updatedAt: timestamp,
			deletedAt: null,
			lastSyncedAt: null,
			lastRemoteChangeAt: null
		};
	});
	await JourneyStorage.saveEntries(entries);
}

function demoText(index: number) {
	const observations = [
		'I took the longer route home and noticed the trees changing colors along the path.',
		'A small conversation over coffee stayed with me longer than I expected.',
		'Today felt busy, so I made dinner slowly and let the evening settle.',
		'I finally made time for a walk without checking my phone every few minutes.',
		'A good song came on at exactly the right moment during the drive.'
	];
	return `${observations[index % observations.length]}\n\nOne thing I want to remember: ${
		[
			'the warm light through the window',
			'how easy it felt to laugh',
			'the first quiet moment of the day',
			'that I finished what I started',
			'there was no rush to get anywhere'
		][index % 5]
	}.`;
}
