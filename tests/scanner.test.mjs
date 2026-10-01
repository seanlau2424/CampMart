import assert from "node:assert/strict";
import { test } from "node:test";
import { createBarcodeScanner } from "../public/barcode-scanner.mjs";
import { requestJson } from "../public/api.mjs";

function deferred() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

function mediaStream() {
    const track = { stopped: false, stop() { this.stopped = true; } };
    return { getTracks: () => [track], track };
}

function setup({ getUserMedia, decode, onScan = () => {} } = {}) {
    const streams = [];
    const constraints = [];
    const callbacks = [];
    const controls = [];
    const video = { srcObject: null, async play() {}, pause() {} };
    const reader = {
        async decodeFromVideoElement(element, callback) {
            const control = { stopped: false, stop() { this.stopped = true; } };
            callbacks.push(callback);
            controls.push(control);
            if (decode) await decode(callback, control);
            return control;
        }
    };
    const scanner = createBarcodeScanner(video, onScan, {
        getReader: async () => reader,
        getMediaDevices: () => ({
            async getUserMedia(value) {
                constraints.push(structuredClone(value));
                const stream = getUserMedia ? await getUserMedia(value) : mediaStream();
                streams.push(stream);
                return stream;
            }
        })
    });
    return { scanner, video, streams, controls, callbacks, constraints };
}

test("closing, reopening, and flipping a scanner release the previous stream and decoder", async () => {
    const { scanner, video, streams, controls, constraints } = setup();
    await scanner.start();
    assert.equal(video.srcObject, streams[0]);
    scanner.stop();
    assert.equal(video.srcObject, null);
    assert.equal(streams[0].track.stopped, true);
    assert.equal(controls[0].stopped, true);
    await scanner.start();
    assert.equal(video.srcObject, streams[1]);
    assert.equal(streams[1].track.stopped, false);
    await scanner.flip();
    assert.equal(streams[1].track.stopped, true);
    assert.equal(controls[1].stopped, true);
    assert.deepEqual(constraints[2].video.facingMode, { exact: "user" });
    scanner.stop();
    assert.ok(streams.every(stream => stream.track.stopped));
    assert.ok(controls.every(control => control.stopped));
});

test("closing during permission releases the late stream without starting the decoder", async () => {
    const permission = deferred();
    const requested = deferred();
    const stream = mediaStream();
    const { scanner, video, controls } = setup({
        getUserMedia() { requested.resolve(); return permission.promise; }
    });
    const starting = scanner.start();
    await requested.promise;
    scanner.stop();
    permission.resolve(stream);
    await starting;
    assert.equal(stream.track.stopped, true);
    assert.equal(video.srcObject, null);
    assert.equal(controls.length, 0);
});

test("closing during decoder startup stops controls when they become available", async () => {
    const decoding = deferred();
    const ready = deferred();
    const { scanner, controls, streams } = setup({
        decode() { decoding.resolve(); return ready.promise; }
    });
    const starting = scanner.start();
    await decoding.promise;
    scanner.stop();
    ready.resolve();
    await starting;
    assert.equal(controls[0].stopped, true);
    assert.equal(streams[0].track.stopped, true);
});

test("an immediate coupon/admin result may close the scanner before startup resolves", async () => {
    const barcodes = [];
    const { scanner, controls, streams } = setup({
        decode(callback, control) { callback({ getText: () => "00123" }, undefined, control); },
        onScan(barcode) { barcodes.push(barcode); scanner.stop(); }
    });
    await scanner.start();
    assert.deepEqual(barcodes, ["00123"]);
    assert.equal(controls[0].stopped, true);
    assert.equal(streams[0].track.stopped, true);
});

test("callbacks from an earlier scanner cannot change a newly opened cart or form", async () => {
    const barcodes = [];
    const { scanner, callbacks, controls } = setup({ onScan: barcode => barcodes.push(barcode) });
    await scanner.start();
    await scanner.start();
    callbacks[0]({ getText: () => "old" }, undefined, controls[0]);
    callbacks[1]({ getText: () => "current" }, undefined, controls[1]);
    assert.deepEqual(barcodes, ["current"]);
    scanner.stop();
});

test("an unavailable rear camera falls back to an available camera", async () => {
    const { scanner, constraints } = setup({
        getUserMedia(value) {
            if (value.video.facingMode.exact) {
                throw Object.assign(new Error("No rear camera"), { name: "OverconstrainedError" });
            }
            return mediaStream();
        }
    });
    await scanner.start();
    assert.deepEqual(constraints.map(value => value.video.facingMode), [{ exact: "environment" }, { ideal: "environment" }]);
    scanner.stop();
});

test("camera denial and playback errors release resources and allow another attempt", async () => {
    let denied = true;
    const { scanner, video, streams } = setup({
        getUserMedia() {
            if (denied) throw Object.assign(new Error("Camera denied"), { name: "NotAllowedError" });
            return mediaStream();
        }
    });
    await assert.rejects(scanner.start(), /Camera denied/);
    denied = false;
    video.play = async () => { throw new Error("Playback failed"); };
    await assert.rejects(scanner.start(), /Playback failed/);
    assert.equal(streams[0].track.stopped, true);
    assert.equal(video.srcObject, null);
    video.play = async () => {};
    await scanner.start();
    assert.equal(video.srcObject, streams[1]);
    scanner.stop();
});

test("request helper handles server errors, non-JSON responses, and connection failures", async t => {
    const responses = [
        new Response(JSON.stringify({ message: "Cannot save" }), { status: 500 }),
        new Response("Bad gateway", { status: 502 }),
        new Response("invalid JSON", { status: 200 }),
        new Error("offline"),
        new Response(JSON.stringify({ success: true }))
    ];
    t.mock.method(globalThis, "fetch", async () => {
        const value = responses.shift();
        if (value instanceof Error) throw value;
        return value;
    });
    await assert.rejects(requestJson("/checkout"), { message: "Cannot save", status: 500 });
    await assert.rejects(requestJson("/checkout"), { status: 502 });
    await assert.rejects(requestJson("/checkout"), /Unable to complete/);
    await assert.rejects(requestJson("/checkout"), /Unable to reach/);
    assert.deepEqual(await requestJson("/checkout"), { success: true });
});
