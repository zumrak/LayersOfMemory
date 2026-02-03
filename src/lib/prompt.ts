import { type Decade, decadeStyleMap } from './decade';

/**
 * Build image generation prompt from user memory and detected decade.
 */
export function buildImagePrompt(memory: string, decade: Decade) {
	const style = decadeStyleMap[decade];
	return `Create an authentic amateur snapshot photograph of this scene: ${memory}

CRITICAL: Do NOT include any text, words, letters, numbers, captions, titles, watermarks, or typography anywhere in the image. The image must be purely visual with no written elements.

Visual style: ${style}

The image should look like a real amateur photograph from the ${decade}s era, captured casually without planning. Avoid centered or symmetrical compositions, avoid posed group arrangements, and avoid any advertising, cinematic, or photo-shoot aesthetic. Prefer incidental framing, occasional partial cut-off subjects, uneven spacing, and spontaneous body language.

Faces should look natural and unretouched with visible skin texture and small imperfections; avoid beautification, smoothing, or idealized symmetry, and avoid distortions. Preserve the memory content and decade cues, but allow environments to feel lived-in, imperfect, and slightly cluttered rather than curated or spotless.

Allow real-world photographic imperfections: uneven or harsh lighting, exposure inconsistencies, slight blur or misfocus, accidental framing errors, minor occlusions, visible grain or noise, and handheld snapshot feel. Avoid polished, stylized, or AI-like rendering.

Do not show cameras, phones, or people taking photos unless the memory explicitly mentions a camera or taking a photo.`;
}
