import { ok, err } from 'neverthrow';
import type { Result } from 'neverthrow';

export const SUPPORTED_DECADES = [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;
export type Decade = (typeof SUPPORTED_DECADES)[number];

export const decadeStyleMap: Record<Decade, string> = {
	1940: 'authentic 1940s black-and-white photography, wartime documentary feel, period-accurate clothing and settings, soft window light, high contrast, visible film grain, slight softness, minor framing imperfections, incidental clutter',
	1950: 'authentic 1950s black-and-white mid-century photography, silver gelatin print look, period-accurate fashion and interiors, clean contrast, subtle halation, fine grain, slight print texture, tiny focus falloff, lived-in details',
	1960: 'authentic 1960s black-and-white documentary photography, candid street style, period-accurate fashion and settings, punchy contrast, noticeable film grain, slight softness, minor motion blur, casual framing',
	1970: 'authentic 1970s color film photography, warm and slightly faded tones, period-accurate fashion and interiors, mixed natural light, visible grain, classic Kodak color print look, minor exposure variance, handheld snapshot feel, everyday clutter',
	1980: 'authentic 1980s color film photography, slightly saturated colors, indoor tungsten and on-camera flash feel, period-accurate fashion and settings, candid snapshot style, visible grain, slight softness, uneven focus, subtle wear on objects',
	1990: 'authentic 1990s color photography, consumer 35mm film or early digital feel, direct flash, cooler tones, period-accurate fashion and technology, candid snapshot look, mild noise, slight white balance shifts, casual environment messiness',
	2000: 'authentic early 2000s digital photography, compact point-and-shoot look, lower dynamic range, slight compression artifacts, mild noise, minor motion blur, casual snapshot framing, slight overexposure',
	2010: 'authentic 2010s digital photography, DSLR or smartphone look, natural lighting, period-accurate fashion and technology, candid lifestyle feel, slight processing, mild noise, minor focus hunting, modest compression',
	2020: 'authentic 2020s digital photography, high-resolution smartphone look, natural lighting, contemporary fashion and technology, candid documentary feel, subtle processing, mild noise, slight exposure inconsistency, minimal computational polish'
};

/**
 * Extrahiere Jahrzehnt aus Text. Sucht nach Mustern wie "1970", "70er", "seventies", etc.
 * Gibt das erste passende Jahrzehnt im unterstützten Bereich zurück.
 */
export function extractDecade(text: string): Result<Decade, string> {
	const normalized = text.toLowerCase();

	// Direktes Jahrmuster: 1940, 1975, 1970er, 1970ern, 1970s, etc.
	const yearMatch = normalized.match(/\b(19[4-9]\d|200\d|201\d|202\d)/);
	if (yearMatch) {
		const year = parseInt(yearMatch[1], 10);
		const decade = (Math.floor(year / 10) * 10) as Decade;
		if (SUPPORTED_DECADES.includes(decade)) {
			return ok(decade);
		}
	}

	// Tolerantes Parsing: z.B. 19190er, 90er, 90ern, 90s, 1990er, 00er
	const compact = normalized.replace(/[\s._'-]/g, '');
	const looseMatch = compact.match(/(\d{2,5})(er|ern|s)\b/);
	if (looseMatch) {
		const lastTwo = parseInt(looseMatch[1].slice(-2), 10);
		const decade = (lastTwo <= 20 ? 2000 + lastTwo : 1900 + lastTwo) as Decade;
		if (SUPPORTED_DECADES.includes(decade)) {
			return ok(decade);
		}
	}

	// Deutsche Muster: 70er, 80er Jahre
	const germanMatch = normalized.match(/\b([4-9]0|00|10|20)er\b/);
	if (germanMatch) {
		const num = parseInt(germanMatch[1], 10);
		const decade = (num <= 20 ? 2000 + num : 1900 + num) as Decade;
		if (SUPPORTED_DECADES.includes(decade)) {
			return ok(decade);
		}
	}

	// Deutsche und englische Muster via Regex
	const patterns: [RegExp, Decade][] = [
		// Deutsch: vierzig*, fünfzig*, sechzig*, siebzig*, achtzig*, neunzig*
		[/vierzig/, 1940],
		[/f(ü|u)nfzig/, 1950],
		[/sechzig/, 1960],
		[/siebzig/, 1970],
		[/achtzig/, 1980],
		[/neunzig/, 1990],
		[/zweitausend/, 2000],
		[/zweitausendzehn/, 2010],
		[/zweitausendzwanzig/, 2020],
		// English
		[/fort(y|ies)/, 1940],
		[/fift(y|ies)/, 1950],
		[/sixt(y|ies)/, 1960],
		[/sevent(y|ies)/, 1970],
		[/eight(y|ies)/, 1980],
		[/ninet(y|ies)/, 1990],
		[/two\s*thousand|2000s/, 2000],
		[/two\s*thousand\s*(ten|tens)|2010s/, 2010],
		[/two\s*thousand\s*(twenty|twenties)|2020s/, 2020]
	];

	for (const [pattern, decade] of patterns) {
		if (pattern.test(normalized)) {
			return ok(decade);
		}
	}

	return err(
		`Konnte das Jahrzehnt nicht erkennen. Bitte nenne ein Jahr oder ein Jahrzehnt (1940-2020). Transkript: "${text}"`
	);
}
