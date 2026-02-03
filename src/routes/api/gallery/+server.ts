import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readdirSync, existsSync } from 'fs';
import { join } from 'path';

export const GET: RequestHandler = () => {
	const galleryDir = join(process.cwd(), 'static', 'gallery');

	if (!existsSync(galleryDir)) {
		return json([]);
	}

	const files = readdirSync(galleryDir)
		.filter((f) => f.endsWith('.png'))
		.sort((a, b) => parseInt(b) - parseInt(a));

	return json(files.map((f) => `/gallery/${f}`));
};
