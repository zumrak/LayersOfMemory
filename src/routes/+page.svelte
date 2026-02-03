<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	type FlowState = 'idle' | 'recording' | 'transcribing' | 'generating' | 'ready' | 'error';

	let flowState = $state<FlowState>('idle');
	let transcript = $state('');
	let decade = $state<number | null>(null);
	let imageBase64 = $state('');
	let mediaType = $state('');
	let errorMessage = $state('');
	let userErrorMessage = $state('');
	let galleryImages = $state<string[]>([]);
	let modalImage = $state<string | null>(null);
	let showcaseImage = $state<string | null>(null);
	let showcaseTimeout: ReturnType<typeof setTimeout> | null = null;

	let mediaRecorder: MediaRecorder | null = null;
	let audioChunks: Blob[] = [];
	let activeRun = $state(0);
	let runStart = $state(0);
	let audioStream: MediaStream | null = null;
	let audioContext: AudioContext | null = null;
	let analyserNode: AnalyserNode | null = null;
	let analyserBuffer: Float32Array<ArrayBuffer> | null = null;
	let vadRafId: number | null = null;
	let speechStartAt = 0;
	let lastSpeechAt = 0;

	const VAD_THRESHOLD = 0.13;
	const VAD_START_HOLD_MS = 250;
	const VAD_STOP_AFTER_MS = 5000;

	const isRecording = $derived(flowState === 'recording');
	const isBusy = $derived(flowState === 'transcribing' || flowState === 'generating');
	const hasImage = $derived(imageBase64.length > 0);
	const isShowcasing = $derived(showcaseImage !== null);
	const isShowcasePending = $derived(hasImage && !showcaseImage);
	const showLoadingIndicator = $derived(Boolean(transcript) && (isBusy || isShowcasePending));
	const showBusyState = $derived(isBusy && !transcript);
	const isActionLocked = $derived(isBusy || isShowcasePending || isShowcasing);

	function logEvent(event: string, details?: Record<string, unknown>) {
		const sinceStart = runStart ? `${Date.now() - runStart}ms` : 'n/a';
		const payload = {
			runId: activeRun,
			state: flowState,
			sinceStart,
			...details
		};
		console.info(`[memory-flow] ${event}`, payload);
	}

	function clearShowcaseTimeout() {
		if (!showcaseTimeout) return;
		clearTimeout(showcaseTimeout);
		showcaseTimeout = null;
	}

	function startShowcaseTimer(runId: number) {
		clearShowcaseTimeout();
		showcaseTimeout = setTimeout(() => {
			if (runId !== activeRun) return;
			resetOutputs();
			flowState = 'idle';
			logEvent('showcase:reset');
		}, 60_000);
	}

	function preloadShowcaseImage(dataUrl: string, runId: number) {
		const img = new Image();
		img.onload = () => {
			if (runId !== activeRun) return;
			modalImage = null;
			showcaseImage = dataUrl;
			startShowcaseTimer(runId);
			logEvent('showcase:ready');
		};
		img.onerror = () => {
			if (runId !== activeRun) return;
			showcaseImage = dataUrl;
			startShowcaseTimer(runId);
			logEvent('showcase:load_error');
		};
		img.src = dataUrl;
	}

	function resetOutputs() {
		transcript = '';
		decade = null;
		imageBase64 = '';
		mediaType = '';
		showcaseImage = null;
		modalImage = null;
		errorMessage = '';
		userErrorMessage = '';
		clearShowcaseTimeout();
	}

	function startVadLoop() {
		if (vadRafId !== null) return;
		vadRafId = requestAnimationFrame(vadTick);
	}

	function stopVadLoop() {
		if (vadRafId === null) return;
		cancelAnimationFrame(vadRafId);
		vadRafId = null;
	}

	function resetVadTimers() {
		speechStartAt = 0;
		lastSpeechAt = 0;
	}

	function vadTick() {
		vadRafId = requestAnimationFrame(vadTick);
		if (!analyserNode || !analyserBuffer) return;

		if (isActionLocked) {
			speechStartAt = 0;
			if (!isRecording) lastSpeechAt = 0;
			return;
		}

		analyserNode.getFloatTimeDomainData(analyserBuffer);
		let sumSquares = 0;
		for (let i = 0; i < analyserBuffer.length; i += 1) {
			const sample = analyserBuffer[i];
			sumSquares += sample * sample;
		}
		const rms = Math.sqrt(sumSquares / analyserBuffer.length);
		const now = performance.now();

		if (rms >= VAD_THRESHOLD) {
			if (!speechStartAt) speechStartAt = now;
			lastSpeechAt = now;
			if (!isRecording && now - speechStartAt >= VAD_START_HOLD_MS) {
				speechStartAt = 0;
				startRecording();
			}
			return;
		}

		speechStartAt = 0;
		if (isRecording && lastSpeechAt && now - lastSpeechAt >= VAD_STOP_AFTER_MS) {
			lastSpeechAt = 0;
			stopRecording();
		}
	}

	async function enableMic() {
		if (audioStream) {
			if (audioContext?.state === 'suspended') {
				await audioContext.resume();
			}
			return audioStream;
		}

		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		audioStream = stream;
		audioContext = new AudioContext();
		const source = audioContext.createMediaStreamSource(stream);
		analyserNode = audioContext.createAnalyser();
		analyserNode.fftSize = 2048;
		analyserNode.smoothingTimeConstant = 0.2;
		analyserBuffer = new Float32Array(
			new ArrayBuffer(analyserNode.fftSize * Float32Array.BYTES_PER_ELEMENT)
		);
		source.connect(analyserNode);
		if (audioContext.state === 'suspended') {
			await audioContext.resume();
		}
		startVadLoop();
		return stream;
	}

	async function loadGallery() {
		const res = await fetch('/api/gallery');
		if (res.ok) galleryImages = await res.json();
	}

	onMount(() => {
		loadGallery();
	});

	onDestroy(() => {
		stopVadLoop();
		activeRun = 0;
		if (mediaRecorder && mediaRecorder.state !== 'inactive') {
			mediaRecorder.onstop = null;
			mediaRecorder.stop();
		}
		mediaRecorder = null;
		if (audioStream) {
			audioStream.getTracks().forEach((t) => t.stop());
			audioStream = null;
		}
		if (audioContext) {
			audioContext.close();
			audioContext = null;
		}
		analyserNode = null;
		analyserBuffer = null;
	});

	async function startRecording() {
		if (isBusy || isRecording) return;
		errorMessage = '';
		userErrorMessage = '';
		resetOutputs();
		flowState = 'recording';
		const runId = activeRun + 1;
		activeRun = runId;
		runStart = Date.now();
		logEvent('recording:start');
		try {
			const stream = await enableMic();
			mediaRecorder = new MediaRecorder(stream);
			audioChunks = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) audioChunks.push(e.data);
			};

			mediaRecorder.onstop = async () => {
				mediaRecorder = null;
				const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
				logEvent('recording:stop', { size: audioBlob.size, type: audioBlob.type });
				await processAudio(audioBlob, runId);
			};

			mediaRecorder.start();
			lastSpeechAt = performance.now();
		} catch (err) {
			errorMessage = 'Microphone access denied';
			userErrorMessage =
				'Mikrofonzugriff blockiert. Bitte erlaube den Zugriff und versuche es erneut.';
			flowState = 'error';
			logEvent('recording:error', {
				error: err instanceof Error ? err.message : 'Microphone access denied'
			});
		}
	}

	function stopRecording() {
		if (mediaRecorder && isRecording && mediaRecorder.state !== 'inactive') {
			flowState = 'transcribing';
			resetVadTimers();
			mediaRecorder.stop();
			logEvent('recording:stop_requested');
		}
	}

	async function processAudio(audioBlob: Blob, runId: number) {
		if (runId !== activeRun) return;
		errorMessage = '';
		userErrorMessage = '';
		flowState = 'transcribing';
		logEvent('transcribe:start');

		const phaseTimer = setTimeout(() => {
			if (runId === activeRun && flowState === 'transcribing') {
				flowState = 'generating';
				logEvent('generate:estimated');
			}
		}, 1200);

		const formData = new FormData();
		formData.append('audio', audioBlob, 'recording.webm');

		try {
			const startedAt = Date.now();
			const res = await fetch('/api/memory-image', {
				method: 'POST',
				body: formData
			});
			logEvent('api:response', { status: res.status, durationMs: Date.now() - startedAt });

			if (!res.ok) {
				const text = await res.text();
				let data;
				try {
					data = JSON.parse(text);
				} catch {
					data = { message: text };
				}
				throw new Error(data.message || 'Request failed');
			}

			const data = await res.json();
			if (runId !== activeRun) return;
			transcript = data.transcript;
			decade = data.decade;
			imageBase64 = data.imageBase64;
			mediaType = data.mediaType;
			await loadGallery();
			flowState = 'ready';
			logEvent('generate:success', { decade, mediaType, bytes: imageBase64.length });
			const dataUrl = `data:${mediaType};base64,${imageBase64}`;
			preloadShowcaseImage(dataUrl, runId);
		} catch (err) {
			if (runId !== activeRun) return;
			errorMessage = err instanceof Error ? err.message : 'Something went wrong';
			if (errorMessage.toLowerCase().includes('detect decade')) {
				userErrorMessage =
					'Ich konnte das Jahrzehnt nicht erkennen. Nenne bitte eine Jahreszahl oder ein Jahrzehnt (z. B. 1980er).';
			} else if (errorMessage.toLowerCase().includes('microphone')) {
				userErrorMessage =
					'Mikrofonzugriff blockiert. Bitte erlaube den Zugriff und versuche es erneut.';
			} else {
				userErrorMessage =
					'Das hat gerade nicht geklappt. Bitte versuche es in einem Moment noch einmal.';
			}
			flowState = 'error';
			logEvent('generate:error', { error: errorMessage });
		} finally {
			clearTimeout(phaseTimer);
		}
	}
</script>

<title>Layers of Memory</title>

{#if isShowcasing}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black">
		<img src={showcaseImage} alt="Generated memory" class="h-full w-full object-cover" />
	</div>
{:else}
	<main class="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center">
		<section class="flex w-full max-w-4xl flex-col items-center gap-6">
			<h1 class="text-5xl font-medium font-serif tracking-tight md:text-6xl">
				Layers of Memory
			</h1>
			<p class="max-w-4xl text-3xl leading-relaxed opacity-90 md:text-4xl">
				Teile eine Erinnerung aus deiner Vergangenheit. Nenne uns das Jahr (1940 - 2020), und wir erwecken sie zum Leben.
			</p>

			<button
				onclick={isRecording ? stopRecording : startRecording}
				disabled={isActionLocked}
				class="rounded-full px-8 py-4 text-lg font-semibold text-[--color-beige] transition-all
                   {isRecording
					? 'animate-pulse bg-red-600 hover:bg-red-700'
					: 'bg-[--color-coffee] hover:bg-[--color-coffee-light]'}
                   disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isRecording ? 'Aufnahme stoppen' : 'Aufnahme starten'}
			</button>
			<p class="text-xl font-medium opacity-80">
				Bitte beginne mit diesem Satz: "Ich kann mich daran erinnern, dass ich im Jahr …“
			</p>

			{#if transcript}
				<div class="mt-6 w-full max-w-2xl rounded-2xl bg-white/10 p-6">
					<p class="text-sm font-medium uppercase tracking-wide opacity-70">Your memory</p>
					<p class="mt-2 text-lg italic md:text-xl">"{transcript}"</p>
					{#if decade}
						<p class="mt-3 text-sm font-semibold opacity-80">Detected decade: {decade}s</p>
					{/if}

					{#if showLoadingIndicator}
						<div class="mt-6 flex flex-col items-center gap-3">
							<div
								class="h-8 w-8 animate-spin rounded-full border-2 border-[--color-beige] border-t-transparent"
							></div>
							<p class="text-sm uppercase tracking-wide opacity-80">The memory is loading</p>
						</div>
					{/if}
				</div>
			{:else if showBusyState}
				<div class="mt-6 flex flex-col items-center gap-3 opacity-80">
					<div
						class="h-8 w-8 animate-spin rounded-full border-2 border-[--color-beige] border-t-transparent"
					></div>
					<p class="text-sm uppercase tracking-wide">
						{flowState === 'transcribing'
							? 'Transcribing your memory...'
							: 'Generating your memory...'}
					</p>
				</div>
			{/if}

			{#if errorMessage}
				<p class="mt-4 rounded-md bg-white/10 px-4 py-3 text-sm">
					{userErrorMessage || errorMessage}
				</p>
			{/if}
		</section>
	</main>

	<!-- Gallery Section -->
	{#if galleryImages.length > 0}
		<section class="bg-white/5 px-8 py-16">
			<h2 class="mb-8 text-center text-3xl font-bold">Your Memories</h2>
			<div class="mx-auto grid max-w-6xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
				{#each galleryImages as src (src)}
					<button type="button" onclick={() => (modalImage = src)} class="cursor-pointer">
						<img
							{src}
							alt="Memory"
							class="aspect-square w-full rounded-lg object-cover shadow-md transition-transform hover:scale-105"
						/>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Polaroid Modal -->
	{#if modalImage}
		<div
			class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
			onclick={() => (modalImage = null)}
			onkeydown={(e) => e.key === 'Escape' && (modalImage = null)}
			role="button"
			tabindex="0"
		>
			<div
				class="rotate-2 transform bg-white p-4 pb-16 shadow-2xl transition-transform"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				tabindex="-1"
			>
				<img src={modalImage} alt="Memory" class="max-h-[70vh] max-w-[80vw] object-contain" />
			</div>
			<button
				type="button"
				class="absolute top-6 right-6 text-4xl text-white hover:text-gray-300"
				onclick={() => (modalImage = null)}
			>
				&times;
			</button>
		</div>
	{/if}
{/if}
