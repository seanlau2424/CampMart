async function createReader() {
    // Other page controls can initialize even if the scanner CDN is unavailable.
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import("https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm"),
        import("https://cdn.jsdelivr.net/npm/@zxing/library@latest/+esm")
    ]);
    return new BrowserMultiFormatReader(new Map([
        [DecodeHintType.TRY_HARDER, true],
        [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]]
    ]));
}

export function createBarcodeScanner(video, onScan, {
    getReader = createReader,
    getMediaDevices = () => navigator.mediaDevices
} = {}) {
    let reader;
    let controls;
    let stream;
    let generation = 0;
    let facingMode = "environment";

    function stop() {
        generation += 1;
        controls?.stop();
        controls = undefined;
        stream?.getTracks().forEach(track => track.stop());
        stream = undefined;
        video.pause();
        video.srcObject = null;
    }

    async function start() {
        stop();
        const current = generation;
        try {
            const devices = getMediaDevices();
            if (!devices?.getUserMedia) {
                throw new Error("Camera access is unavailable. Please use HTTPS or localhost.");
            }
            reader = reader || await getReader();
            if (current !== generation) return;
            const constraints = {
                video: {
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    facingMode: { exact: facingMode }
                }
            };
            let nextStream;
            try {
                nextStream = await devices.getUserMedia(constraints);
            } catch (error) {
                if (current !== generation) return;
                if (error.name !== "OverconstrainedError" && error.name !== "NotFoundError") throw error;
                constraints.video.facingMode = { ideal: facingMode };
                nextStream = await devices.getUserMedia(constraints);
            }
            // Permission can be granted after the user closes or flips a camera.
            if (current !== generation) {
                nextStream.getTracks().forEach(track => track.stop());
                return;
            }
            stream = nextStream;
            video.srcObject = stream;
            video.muted = true;
            await video.play();
            if (current !== generation) return;

            const nextControls = await reader.decodeFromVideoElement(video, (result, error, activeControls) => {
                if (current !== generation) {
                    activeControls?.stop();
                    return;
                }
                // A result may arrive before decodeFromVideoElement resolves.
                controls = activeControls;
                if (result) onScan(result.getText());
            });
            if (current !== generation) nextControls.stop();
            else controls = nextControls;
        } catch (error) {
            if (current !== generation) return;
            stop();
            throw error;
        }
    }

    return {
        start,
        stop,
        flip() {
            facingMode = facingMode === "environment" ? "user" : "environment";
            return start();
        }
    };
}

export function createScanSound() {
    const sound = new Audio("/assets/barcode-scan-sound.mp3");
    sound.volume = 0.7;
    sound.preload = "auto";
    return {
        unlock() {
            sound.play().catch(() => {});
            sound.pause();
            sound.currentTime = 0;
        },
        play() {
            sound.currentTime = 0;
            sound.play().catch(error => console.log("Scan sound blocked:", error));
        }
    };
}
