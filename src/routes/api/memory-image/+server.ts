import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { err, fromPromise, fromThrowable, ok } from 'neverthrow';
import { extractDecade } from '$lib/decade';
import { buildImagePrompt } from '$lib/prompt';
import { env } from '$env/dynamic/private';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import https from 'node:https';

const WHISPER_BASE_URL = env.WHISPER_BASE_URL || 'http://127.0.0.1:8000';
const OPENROUTER_API_KEY = env.OPENROUTER_API_KEY;
const OPENROUTER_IMAGE_MODEL = env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';
const OPENROUTER_IMAGE_FALLBACK_MODEL = env.OPENROUTER_IMAGE_FALLBACK_MODEL;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_ERROR_MARKERS = ['fetch failed', 'econnreset', 'etimedout', 'enotfound', 'eai_again', 'aborted'];
const OPENROUTER_IMAGE_ATTEMPTS = boundedInt(env.OPENROUTER_IMAGE_ATTEMPTS, 8, 1, 20);
const OPENROUTER_FETCH_RETRIES = boundedInt(env.OPENROUTER_FETCH_RETRIES, 5, 0, 10);
const OPENROUTER_HTTPS_FALLBACK = env.OPENROUTER_HTTPS_FALLBACK !== 'false';
const OPENROUTER_HTTPS_FALLBACK_RETRIES = boundedInt(env.OPENROUTER_HTTPS_FALLBACK_RETRIES, 1, 0, 5);
const OPENROUTER_IMAGE_RETRY_DELAY_MS = boundedInt(
	env.OPENROUTER_IMAGE_RETRY_DELAY_MS,
	1200,
	500,
	5000
);
const OPENROUTER_HTTPS_AGENT = new https.Agent({ keepAlive: false, family: 4 });

function boundedInt(value: string | undefined, fallback: number, min: number, max: number) {
	const parsed = Number.parseInt(value ?? '', 10);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(max, Math.max(min, parsed));
}

function logServer(event: string, details?: Record<string, unknown>) {
	const payload = details ? ` ${JSON.stringify(details)}` : '';
	console.info(`[memory-image] ${event}${payload}`);
}

function isRetryableError(message: string) {
	const normalized = message.toLowerCase();
	return RETRYABLE_ERROR_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeOpenRouterError(message: string) {
	const normalized = message.toLowerCase();
	if (normalized.includes('econnreset')) {
		return 'OpenRouter Verbindung wurde zurückgesetzt. Bitte gleich erneut versuchen.';
	}
	if (normalized.includes('etimedout') || normalized.includes('timeout')) {
		return 'OpenRouter hat nicht rechtzeitig geantwortet. Bitte erneut versuchen.';
	}
	if (normalized.includes('enotfound') || normalized.includes('eai_again')) {
		return 'OpenRouter ist gerade nicht erreichbar (DNS). Bitte später erneut versuchen.';
	}
	if (normalized.includes('fetch failed')) {
		return 'OpenRouter Netzwerkfehler. Bitte in einem Moment erneut versuchen.';
	}
	return message;
}

async function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
	const controller = new AbortController();
	let timedOut = false;
	const timeout = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	try {
		return await fetch(input, { ...init, signal: controller.signal });
	} catch (error) {
		const errorName = error instanceof Error ? error.name : 'UnknownError';
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorCause = error instanceof Error ? error.cause : undefined;
		const causeCode =
			typeof errorCause === 'object' && errorCause && 'code' in errorCause
				? String((errorCause as { code?: unknown }).code)
				: undefined;
		throw error;
	} finally {
		clearTimeout(timeout);
	}
}

async function fetchWithHttpsFallback(url: string, init: RequestInit, timeoutMs: number) {
	const headers = new Headers(init.headers);
	headers.set('Connection', 'close');
	const body = typeof init.body === 'string' ? init.body : '';
	if (body.length > 0 && !headers.has('content-length')) {
		headers.set('content-length', Buffer.byteLength(body, 'utf8').toString());
	}

	return fromPromise(
		new Promise<Response>((resolve, reject) => {
			const urlObj = new URL(url);
			const req = https.request(
				{
					protocol: urlObj.protocol,
					hostname: urlObj.hostname,
					port: urlObj.port || 443,
					path: `${urlObj.pathname}${urlObj.search}`,
					method: init.method ?? 'GET',
					headers: Object.fromEntries(headers.entries()),
					agent: OPENROUTER_HTTPS_AGENT,
					family: 4
				},
				(res) => {
					const chunks: Buffer[] = [];
					res.on('data', (chunk) => {
						chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
					});
					res.on('end', () => {
						const responseBody = Buffer.concat(chunks).toString('utf8');
						const responseHeaders = new Headers();
						for (const [key, value] of Object.entries(res.headers)) {
							if (typeof value === 'string') responseHeaders.set(key, value);
							else if (Array.isArray(value)) {
								for (const entry of value) responseHeaders.append(key, entry);
							}
						}
						resolve(
							new Response(responseBody, {
								status: res.statusCode ?? 500,
								headers: responseHeaders
							})
						);
					});
				}
			);

			req.setTimeout(timeoutMs, () => {
				req.destroy(new Error('HTTPS request timeout'));
			});
			req.on('error', (err) => reject(err));
			if (body.length > 0) req.write(body);
			req.end();
		}),
		(e) => (e instanceof Error ? e.message : 'HTTPS request failed')
	);
}

async function fetchWithRetry(
	input: RequestInfo,
	init: RequestInit,
	{ timeoutMs, retries, retryDelayMs }: { timeoutMs: number; retries: number; retryDelayMs: number }
) {
	for (let attempt = 0; attempt <= retries; attempt += 1) {
		logServer('fetch:attempt', {
			url: typeof input === 'string' ? input : 'Request',
			attempt: attempt + 1,
			timeoutMs
		});
		const responseResult = await fromPromise(
			fetchWithTimeout(input, init, timeoutMs),
			(e) => (e instanceof Error ? e.message : 'Fetch failed')
		);

		if (responseResult.isErr()) {
			if (attempt < retries && isRetryableError(responseResult.error)) {
				await sleep(retryDelayMs * (attempt + 1));
				continue;
			}
			return err(responseResult.error);
		}

		const response = responseResult.value;
		if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < retries) {
			await sleep(retryDelayMs * (attempt + 1));
			continue;
		}

		return ok<Response, string>(response);
	}

	return err('Fetch failed');
}

async function resolveImageData(imageUrl: string) {
	const trimmed = imageUrl.trim();
	if (trimmed.startsWith('data:')) {
		const [header, base64Data] = trimmed.split(',');
		if (!base64Data) {
			return err('Invalid image data returned from OpenRouter');
		}
		const mimeMatch = header?.match(/data:([^;]+)/);
		const mimeType = mimeMatch?.[1] || 'image/png';
		return ok({ base64Data, mimeType });
	}

	if (trimmed.startsWith('http')) {
		const responseResult = await fetchWithRetry(
			trimmed,
			{ method: 'GET' },
			{ timeoutMs: 20_000, retries: 2, retryDelayMs: 500 }
		);

		if (responseResult.isErr()) {
			return err(responseResult.error);
		}

		const response = responseResult.value;
		if (!response.ok) {
			const text = await response.text();
			return err(`Image fetch error (${response.status}): ${text}`);
		}

		const arrayBuffer = await response.arrayBuffer();
		const mimeType = response.headers.get('content-type') || 'image/png';
		const base64Data = Buffer.from(arrayBuffer).toString('base64');
		return ok({ base64Data, mimeType });
	}

	if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
		return ok({ base64Data: trimmed, mimeType: 'image/png' });
	}

	return err('Unrecognized image data returned from OpenRouter');
}

type OpenRouterMessageContent =
	| string
	| Array<{
		type?: string;
		text?: string;
		image_url?: { url?: string } | string;
		url?: string;
	}>;

function imageUrlFromValue(value: { url?: string } | string | undefined) {
	if (typeof value === 'string') return value;
	return value?.url;
}

function extractImageUrlFromContent(content: OpenRouterMessageContent | undefined) {
	if (!content) return null;
	if (typeof content === 'string') {
		const dataMatch = content.match(
			/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/
		);
		if (dataMatch) return dataMatch[0];

		const urlMatch = content.match(/https?:\/\/[^\s)"]+/);
		return urlMatch?.[0] ?? null;
	}

	for (const part of content) {
		const imageUrl = imageUrlFromValue(part.image_url) ?? part.url;
		if (typeof imageUrl === 'string' && imageUrl.length > 0) return imageUrl;
		if (typeof part.text === 'string') {
			const dataMatch = part.text.match(
				/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/
			);
			if (dataMatch) return dataMatch[0];
			const urlMatch = part.text.match(/https?:\/\/[^\s)"]+/);
			if (urlMatch) return urlMatch[0];
		}
	}

	return null;
}

function contentMeta(content: OpenRouterMessageContent | undefined) {
	if (!content) return { contentType: 'missing' };
	if (typeof content === 'string') {
		const hasDataUrl = content.includes('data:image');
		return {
			contentType: 'string',
			contentLength: content.length,
			hasDataUrl,
			preview: hasDataUrl ? undefined : content.slice(0, 160)
		};
	}
	return {
		contentType: 'array',
		contentParts: content.length,
		imageParts: content.filter((part) => Boolean(imageUrlFromValue(part.image_url) || part.url)).length
	};
}

type OpenRouterImagePart = {
	image_url?: { url?: string } | string;
	url?: string;
	b64_json?: string;
	mime_type?: string;
	type?: string;
	data?: string;
};

interface OpenRouterImageResponse {
	choices?: Array<{
		message?: {
			images?: OpenRouterImagePart[];
			content?: OpenRouterMessageContent;
		};
		finish_reason?: string;
	}>;
	error?: {
		message?: string;
		code?: string | number;
	};
}

function extractImageFromImages(images: OpenRouterImagePart[] | undefined) {
	if (!images?.length) return null;
	for (const image of images) {
		if (!image) continue;
		const directUrl = imageUrlFromValue(image.image_url) ?? image.url;
		if (typeof directUrl === 'string' && directUrl.length > 0) return directUrl;
		if (typeof image.b64_json === 'string' && image.b64_json.length > 0) return image.b64_json;
		if (typeof image.data === 'string' && image.data.length > 0) return image.data;
	}
	return null;
}

function buildOpenRouterPrompt(prompt: string, attempt: number) {
	if (attempt === 0) return prompt;
	return `${prompt}\n\nReturn only an image. Do not respond with text.`;
}

async function requestOpenRouterImage(prompt: string, requestId: string) {
	for (let attempt = 0; attempt < OPENROUTER_IMAGE_ATTEMPTS; attempt += 1) {
		const model =
			attempt > 0 && OPENROUTER_IMAGE_FALLBACK_MODEL
				? OPENROUTER_IMAGE_FALLBACK_MODEL
				: OPENROUTER_IMAGE_MODEL;
		const promptForAttempt = buildOpenRouterPrompt(prompt, attempt);
		logServer('openrouter:request', {
			requestId,
			attempt: attempt + 1,
			model,
			promptLength: promptForAttempt.length
		});
		const openRouterBody = JSON.stringify({
			model,
			messages: [{ role: 'user', content: promptForAttempt }],
			modalities: ['image', 'text'],
			image_config: { aspect_ratio: '16:9' }
		});

		let openRouterResponseResult = await fetchWithRetry(
			OPENROUTER_URL,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${OPENROUTER_API_KEY}`
				},
				body: openRouterBody
			},
			{ timeoutMs: 60_000, retries: OPENROUTER_FETCH_RETRIES, retryDelayMs: 800 }
		);

		if (openRouterResponseResult.isErr()) {
			if (OPENROUTER_HTTPS_FALLBACK) {
				for (let fallbackAttempt = 0; fallbackAttempt <= OPENROUTER_HTTPS_FALLBACK_RETRIES; fallbackAttempt += 1) {
					const fallbackResult = await fetchWithHttpsFallback(OPENROUTER_URL, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Authorization: `Bearer ${OPENROUTER_API_KEY}`
						},
						body: openRouterBody
					}, 60_000);
					if (fallbackResult.isOk()) {
						openRouterResponseResult = fallbackResult;
						break;
					}
				}
			}
			if (openRouterResponseResult.isErr()) {
				const message = normalizeOpenRouterError(openRouterResponseResult.error);
				logServer('openrouter:failed', { requestId, attempt: attempt + 1, error: message });
				if (attempt < OPENROUTER_IMAGE_ATTEMPTS - 1) {
					await sleep(OPENROUTER_IMAGE_RETRY_DELAY_MS * (attempt + 1));
					continue;
				}
				return err(message);
			}
		}

		const openRouterResponse = openRouterResponseResult.value;
		if (!openRouterResponse.ok) {
			const text = await openRouterResponse.text();
			logServer('openrouter:error', {
				requestId,
				attempt: attempt + 1,
				status: openRouterResponse.status
			});
			if (attempt < OPENROUTER_IMAGE_ATTEMPTS - 1 && RETRYABLE_STATUSES.has(openRouterResponse.status)) {
				await sleep(OPENROUTER_IMAGE_RETRY_DELAY_MS * (attempt + 1));
				continue;
			}
			return err(`OpenRouter error (${openRouterResponse.status}): ${text}`);
		}

		const dataResult = await fromPromise(openRouterResponse.json(), (e) =>
			e instanceof Error ? e.message : 'OpenRouter response parse failed'
		);
		if (dataResult.isErr()) {
			logServer('openrouter:parse_failed', {
				requestId,
				attempt: attempt + 1,
				error: dataResult.error
			});
			if (attempt < OPENROUTER_IMAGE_ATTEMPTS - 1) {
				await sleep(OPENROUTER_IMAGE_RETRY_DELAY_MS * (attempt + 1));
				continue;
			}
			return err(dataResult.error);
		}

		const openRouterData = dataResult.value as OpenRouterImageResponse;
		if (openRouterData.error?.message) {
			const message = openRouterData.error.message;
			logServer('openrouter:api_error', {
				requestId,
				attempt: attempt + 1,
				code: openRouterData.error.code,
				message
			});
			if (attempt < OPENROUTER_IMAGE_ATTEMPTS - 1) {
				await sleep(OPENROUTER_IMAGE_RETRY_DELAY_MS * (attempt + 1));
				continue;
			}
			return err(message);
		}

		const openRouterMessage = openRouterData.choices?.[0]?.message;
		const imageData =
			extractImageFromImages(openRouterMessage?.images) ||
			extractImageUrlFromContent(openRouterMessage?.content);
		if (!imageData) {
			const finishReason = openRouterData.choices?.[0]?.finish_reason;
			const content = openRouterMessage?.content;
			const contentType = Array.isArray(content)
				? 'array'
				: typeof content === 'string'
					? 'string'
					: 'missing';
			const contentLength = typeof content === 'string' ? content.length : undefined;
			const contentParts = Array.isArray(content) ? content.length : undefined;
			logServer('openrouter:missing_image', {
				requestId,
				attempt: attempt + 1,
				finishReason,
				imageCount: openRouterMessage?.images?.length ?? 0,
				...contentMeta(openRouterMessage?.content)
			});
			if (attempt < OPENROUTER_IMAGE_ATTEMPTS - 1) {
				await sleep(OPENROUTER_IMAGE_RETRY_DELAY_MS * (attempt + 1));
				continue;
			}
			return err('No image returned from OpenRouter');
		}

		return ok(imageData);
	}

	return err('OpenRouter image generation failed');
}

export const POST: RequestHandler = async ({ request }) => {
	// 1. Parse audio from form data
	const formData = await request.formData();
	const audioFile = formData.get('audio');

	if (!audioFile || !(audioFile instanceof File)) {
		error(400, { message: 'Missing audio file' });
	}

	const requestId = crypto.randomUUID();
	logServer('request:start', { requestId, audioType: audioFile.type, audioSize: audioFile.size });

	// 2. Forward to Whisper service
	const whisperForm = new FormData();
	whisperForm.append('audio', audioFile);

	const whisperResponseResult = await fetchWithRetry(
		`${WHISPER_BASE_URL}/transcribe`,
		{
			method: 'POST',
			body: whisperForm
		},
		{ timeoutMs: 40_000, retries: 2, retryDelayMs: 500 }
	);

	if (whisperResponseResult.isErr()) {
		logServer('whisper:failed', { requestId, error: whisperResponseResult.error });
		error(502, { message: whisperResponseResult.error });
	}

	const whisperResponse = whisperResponseResult.value;
	if (!whisperResponse.ok) {
		const text = await whisperResponse.text();
		logServer('whisper:error', { requestId, status: whisperResponse.status });
		error(502, { message: `Whisper error (${whisperResponse.status}): ${text}` });
	}

	const { text: transcript } = (await whisperResponse.json()) as {
		text: string;
		language: string;
	};
	logServer('whisper:ok', { requestId, transcriptLength: transcript.length, transcript });

	// 3. Extract decade from transcript
	const decadeResult = extractDecade(transcript);
	if (decadeResult.isErr()) {
		error(422, { message: decadeResult.error });
	}
	const decade = decadeResult.value;

	// 4. Build prompt and generate image
	const prompt = buildImagePrompt(transcript, decade);

	if (!OPENROUTER_API_KEY) {
		error(500, { message: 'OPENROUTER_API_KEY not configured' });
	}

	// OpenRouter requires using chat/completions with modalities for image generation
	const imageResult = await requestOpenRouterImage(prompt, requestId);
	if (imageResult.isErr()) {
		error(502, { message: imageResult.error });
	}
	const imageData = imageResult.value;

	const resolvedImage = await resolveImageData(imageData);
	if (resolvedImage.isErr()) {
		logServer('image:resolve_failed', { requestId, error: resolvedImage.error });
		error(502, { message: resolvedImage.error });
	}

	const { base64Data, mimeType } = resolvedImage.value;
	logServer('image:resolved', { requestId, mimeType, bytes: base64Data.length });

	// 5. Save image to gallery
	const galleryDir = join(process.cwd(), 'static', 'gallery');
	const ensureGalleryDir = fromThrowable(
		() => {
			if (!existsSync(galleryDir)) mkdirSync(galleryDir, { recursive: true });
		},
		(e) => (e instanceof Error ? e.message : 'Failed to create gallery directory')
	);

	if (ensureGalleryDir().isErr()) {
		error(500, { message: 'Failed to create gallery directory' });
	}

	const filename = `${Date.now()}.png`;
	const filepath = join(galleryDir, filename);
	const saveImage = fromThrowable(
		() => writeFileSync(filepath, Buffer.from(base64Data, 'base64')),
		(e) => (e instanceof Error ? e.message : 'Failed to save image')
	);

	const saveResult = saveImage();
	if (saveResult.isErr()) {
		logServer('image:save_failed', { requestId, error: saveResult.error });
		error(500, { message: saveResult.error });
	}
	logServer('request:complete', { requestId, filename });

	// 6. Return result
	return json({
		transcript,
		decade,
		prompt,
		imageBase64: base64Data,
		mediaType: mimeType
	});
};
