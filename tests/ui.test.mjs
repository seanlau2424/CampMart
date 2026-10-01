import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { escapeHtml } from "../public/api.mjs";

// Exercise the actual page scripts with simulated events and camera results.
// These checks cover behavior; they do not replace real browser/device testing.
class Element {
    constructor() {
        this.children = [];
        this.listeners = new Map();
        this.queries = new Map();
        this.style = {};
        this.disabled = false;
        this.value = "";
        this.textContent = "";
        const classes = new Set();
        this.classList = {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            contains: name => classes.has(name),
            toggle: name => classes.has(name) ? classes.delete(name) : classes.add(name)
        };
    }
    set innerHTML(value) {
        this.markup = value;
        this.children = [];
        this.queries.clear();
    }
    get innerHTML() { return this.markup; }
    appendChild(child) { this.children.push(child); }
    querySelector(selector) {
        if (this.markup && selector.startsWith("[data-action=") && !this.markup.includes(selector.slice(1, -1))) return null;
        if (!this.queries.has(selector)) this.queries.set(selector, new Element());
        return this.queries.get(selector);
    }
    addEventListener(name, handler) { this.listeners.set(name, handler); }
    async trigger(name = "click") {
        await this.listeners.get(name)?.({ preventDefault() {} });
        if (name === "click") await this.onclick?.();
    }
    reset() {}
    focus() {}
}

const item = { id: "00123", barcode: "00123", name: "Tea <img src=x onerror=alert(1)> & biscuits", price: 5, cost: 3, quantity: 2 };
const inactive = { barcode: "00234", name: "RM10 Coupon", value: 10, activated: false };
const active = { barcode: "00345", name: "RM10 Coupon", value: 10, activated: true };

async function page(name, handleRequest = async () => ({ success: true })) {
    const markup = await readFile(new URL(`../public/${name}.html`, import.meta.url), "utf8");
    const elements = new Map([...markup.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element()]));
    const root = new Element();
    const alerts = [];
    const requests = [];
    const window = new Element();
    window.location = { href: "" };
    const scanners = new Map();
    let time = 0;
    const requestJson = async (url, options) => {
        requests.push({ url, options });
        const result = await handleRequest(url, options);
        if (result !== undefined && url !== "/inventory" && url !== "/coupons" && url !== "/transactions") return result;
        if (options) return result;
        if (url === "/inventory") return Array.isArray(result) ? result : [item];
        if (url === "/coupons") return Array.isArray(result) ? result : [inactive, active];
        if (url === "/transactions") return Array.isArray(result) ? result : [{ date: "25-9-2026 10:00", sales: [[item.name, 2, 6, 10]], couponDiscount: 10 }];
        return result;
    };
    const context = vm.createContext({
        document: {
            getElementById: id => elements.get(id),
            createElement: () => new Element(),
            querySelector: selector => root.querySelector(selector)
        },
        window, alert: message => alerts.push(message), console,
        Date: { now: () => time }, requestJson, escapeHtml,
        createBarcodeScanner(video, onScan) {
            const scanner = {
                starts: 0, flips: 0, stops: 0, onScan,
                async start() { this.starts += 1; },
                async flip() { this.flips += 1; },
                stop() { this.stops += 1; }
            };
            scanners.set(video, scanner);
            return scanner;
        },
        createScanSound: () => ({ unlock() {}, play() {} }),
        api: { requestJson }
    });
    const source = await readFile(new URL(`../public/${name}.js`, import.meta.url), "utf8");
    vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replace('await import("./api.mjs")', "api"), context);
    await new Promise(resolve => setImmediate(resolve));
    return {
        element: id => elements.get(id), root, alerts, requests, window,
        scanner: (id = "video") => scanners.get(elements.get(id)),
        scan(barcode, id = "video") { time += 2100; scanners.get(elements.get(id)).onScan(barcode); }
    };
}

test("item cart keeps its layout, escapes names, respects stock limits, and clears totals", async () => {
    const { element, scan, root } = await page("app");
    await element("scanButton").trigger();
    scan(item.barcode);
    const row = () => element("cartItems").children[0];
    assert.ok(row().innerHTML.includes(escapeHtml(item.name)));
    for (const name of ["cart-item-info", "cart-item-controls", "cart-item-total"]) assert.ok(row().innerHTML.includes(name));
    assert.doesNotMatch(row().innerHTML, /onclick=/);
    assert.equal(element("cartTotal").textContent, "RM 5.00");
    await row().querySelector('[data-action="increase"]').trigger();
    await row().querySelector('[data-action="increase"]').trigger();
    assert.equal(element("cartTotal").textContent, "RM 10.00");
    await row().querySelector('[data-action="decrease"]').trigger();
    await row().querySelector('[data-action="decrease"]').trigger();
    assert.equal(element("cartTotal").textContent, "RM 0.00");
    assert.equal(element("nettTotal").textContent, "RM 0.00");
    assert.equal(root.querySelector(".cart-action-buttons").style.display, "none");
    assert.match(element("cartItems").innerHTML, /welcomemaltese\.gif/);
});

test("coupon purchases stay quantity one and active coupons show the existing error", async () => {
    const { element, scan } = await page("app");
    await element("scanButton").trigger();
    scan(inactive.barcode);
    scan(inactive.barcode);
    assert.equal(element("cartItems").children.length, 1);
    assert.equal(element("cartTotal").textContent, "RM 10.00");
    assert.doesNotMatch(element("cartItems").children[0].innerHTML, /<button/);
    scan(active.barcode);
    assert.equal(element("couponErrorModal").classList.contains("show"), true);
    assert.match(element("couponErrorMessage").textContent, /already been purchased/);
    await element("closeCouponError").trigger();
    await element("clearCartButton").trigger();
    assert.equal(element("cartTotal").textContent, "RM 0.00");
    assert.equal(element("clearCartButton").style.display, "none");
});

test("coupon scan messages, full discount, zero nett total, and clear cart are retained", async () => {
    const { element, scan, scanner } = await page("app");
    await element("scanButton").trigger();
    scan(item.barcode);
    await element("couponButton").trigger();
    assert.equal(element("cameraContainer").style.display, "none");
    scan("missing", "couponVideo");
    assert.equal(element("couponScanMessage").textContent, "Coupon not found!");
    scan(inactive.barcode, "couponVideo");
    assert.match(element("couponScanMessage").textContent, /not been activated/);
    await element("couponFlipCamera").trigger();
    assert.equal(scanner("couponVideo").flips, 1);
    scan(active.barcode, "couponVideo");
    assert.equal(element("couponCameraModal").classList.contains("show"), false);
    assert.equal(element("couponDiscount").textContent, "-RM 10.00");
    assert.equal(element("nettTotal").textContent, "RM 0.00");
    await element("couponButton").trigger();
    scan(active.barcode, "couponVideo");
    assert.equal(element("couponScanMessage").textContent, "This coupon has already been applied.");
    await element("couponCloseScan").trigger();
    await element("clearCartButton").trigger();
    assert.equal(element("couponDiscount").textContent, "-RM 0.00");
});

test("Cash payment saves at I've Paid, prevents overlapping submissions, and Done only resets", async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    let checkoutCalls = 0;
    let submitted;
    const { element, scan } = await page("app", async (url, options) => {
        if (url !== "/checkout") return;
        checkoutCalls += 1;
        submitted = JSON.parse(options.body);
        return pending;
    });
    await element("scanButton").trigger();
    scan(item.barcode);
    await element("checkoutButton").trigger();
    await element("payCash").trigger();
    assert.equal(checkoutCalls, 0);
    const first = element("cashPaid").trigger();
    const second = element("cashPaid").trigger();
    scan(item.barcode);
    await element("clearCartButton").trigger();
    assert.equal(element("cartTotal").textContent, "RM 5.00");
    assert.equal(checkoutCalls, 1);
    assert.equal(submitted.mode, "Cash");
    assert.equal(submitted.couponBarcode, null);
    assert.equal(submitted.items[0].quantity, 1);
    finish({ success: true });
    await Promise.all([first, second]);
    assert.equal(element("thankYouModal").classList.contains("show"), true);
    await element("cashPaid").trigger();
    await element("donePayment").trigger();
    assert.equal(checkoutCalls, 1);
    assert.equal(element("thankYouModal").classList.contains("show"), false);
    assert.equal(element("cartTotal").textContent, "RM 0.00");
});

test("failed TNG checkout keeps the cart and coupon; retry succeeds without losing the payment flow", async () => {
    let fail = true;
    let calls = 0;
    const { element, scan, alerts } = await page("app", async (url, options) => {
        if (url !== "/checkout") return;
        calls += 1;
        const submitted = JSON.parse(options.body);
        assert.equal(submitted.mode, "TNG");
        assert.equal(submitted.couponBarcode, active.barcode);
        assert.equal(submitted.couponDiscount, 10);
        if (fail) throw new Error("Could not save payment");
        return { success: true };
    });
    await element("scanButton").trigger();
    scan(item.barcode);
    await element("couponButton").trigger();
    scan(active.barcode, "couponVideo");
    await element("checkoutButton").trigger();
    assert.equal(element("checkoutTotal").textContent, "RM 0.00");
    await element("payQr").trigger();
    await element("qrPaid").trigger();
    assert.deepEqual(alerts, ["Could not save payment"]);
    assert.equal(element("qrModal").classList.contains("show"), true);
    assert.equal(element("thankYouModal").classList.contains("show"), false);
    assert.equal(element("cartTotal").textContent, "RM 5.00");
    assert.equal(element("couponDiscount").textContent, "-RM 10.00");
    assert.equal(element("qrPaid").disabled, false);
    fail = false;
    await element("qrPaid").trigger();
    assert.equal(element("thankYouModal").classList.contains("show"), true);
    assert.equal(calls, 2);
});

test("closing while catalog loads does not reopen the camera; TNG display and login still work", async () => {
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    const { element, scanner, window } = await page("app", () => pending);
    const opening = element("scanButton").trigger();
    await element("closeScan").trigger();
    finish();
    await opening;
    assert.equal(scanner().starts, 0);
    assert.equal(element("cameraContainer").style.display, "none");
    await element("showTngQr").trigger();
    assert.equal(element("showQrModal").classList.contains("show"), true);
    await element("closeShowQr").trigger();
    assert.equal(element("showQrModal").classList.contains("show"), false);
    await element("adminLogin").trigger();
    assert.equal(window.location.href, "/login");
});

test("admin camera flipping retains coupon purpose and coupon name generation", async () => {
    const { element, scanner, scan } = await page("admin");
    await element("addCouponButton").trigger();
    await element("flipCamera").trigger();
    scan("00999");
    assert.equal(scanner().flips, 1);
    assert.equal(element("couponModal").classList.contains("show"), true);
    assert.equal(element("itemModal").classList.contains("show"), false);
    assert.equal(element("couponBarcode").value, "00999");
    element("couponValue").value = "2.5";
    await element("couponValue").trigger("input");
    assert.equal(element("couponName").value, "RM2.5 Coupon");
});

test("admin keeps gross sales, discounted profit, safe names, and transaction expansion", async () => {
    const { element } = await page("admin");
    assert.equal(element("totalSales").textContent, "RM 10.00");
    assert.equal(element("totalProfit").textContent, "RM -6.00");
    const card = element("inventoryGrid").children[0];
    assert.ok(card.innerHTML.includes(escapeHtml(item.name)));
    assert.doesNotMatch(card.innerHTML, /onclick=/);
    const row = element("transactionsList").children[0];
    assert.ok(row.innerHTML.includes(escapeHtml(item.name)));
    assert.match(row.innerHTML, /-RM 10\.00/);
    await row.querySelector(".expand-btn").trigger();
    assert.equal(row.querySelector(".transaction-details").classList.contains("show"), true);
    await card.querySelector(".edit-btn").trigger();
    assert.equal(element("itemName").value, item.name);
});

test("failed admin item/coupon saves and deletions keep their forms and confirmations", async () => {
    const { element, alerts, scan } = await page("admin", async (url, options) => {
        if (options) throw new Error("Save unavailable");
    });
    const card = element("inventoryGrid").children[0];
    await card.querySelector(".edit-btn").trigger();
    await element("itemForm").trigger("submit");
    assert.equal(element("itemModal").classList.contains("show"), true);
    assert.equal(element("itemName").value, item.name);
    assert.equal(element("cancelButton").disabled, false);
    await element("cancelButton").trigger();
    await card.querySelector(".delete-btn").trigger();
    await element("confirmDelete").trigger();
    assert.equal(element("deleteModal").classList.contains("show"), true);
    await element("cancelDelete").trigger();
    await element("addCouponButton").trigger();
    scan("00999");
    element("couponValue").value = "5";
    await element("couponForm").trigger("submit");
    assert.equal(element("couponModal").classList.contains("show"), true);
    assert.equal(element("couponValue").value, "5");
    await element("cancelCoupon").trigger();
    await element("couponsList").children[0].querySelector(".delete-coupon-btn").trigger();
    await element("confirmDeleteCoupon").trigger();
    assert.equal(element("deleteCouponModal").classList.contains("show"), true);
    assert.equal(element("confirmDeleteCoupon").disabled, false);
    assert.deepEqual(alerts, Array(4).fill("Save unavailable"));
});

test("login errors leave the form usable and a subsequent successful login redirects", async () => {
    let fail = true;
    const { element, window, alerts } = await page("login", async () => {
        if (fail) throw new Error("Invalid username or password");
        return { success: true };
    });
    element("username").value = "tester";
    element("password").value = "password";
    await element("loginForm").trigger("submit");
    assert.deepEqual(alerts, ["Invalid username or password"]);
    assert.equal(element("loginForm").querySelector('button[type="submit"]').disabled, false);
    fail = false;
    await element("loginForm").trigger("submit");
    assert.equal(window.location.href, "/admin");
});
