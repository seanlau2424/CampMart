const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { once } = require("node:events");
const { createApp } = require("../server");

const item = { id: "00123", barcode: "00123", name: "Cookies", cost: 3, price: 5, quantity: 20 };
const inactive = { barcode: "00234", name: "RM10 Coupon", value: 10, activated: false };
const active = { barcode: "00345", name: "RM10 Coupon", value: 10, activated: true };
const files = ["inventory.json", "coupons.json", "transactions.json"];

async function setup(t) {
    const root = path.resolve(os.tmpdir());
    const directory = await fs.mkdtemp(path.join(root, "campmart-test-"));
    let server;
    t.after(async () => {
        if (server) {
            server.closeAllConnections();
            await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
        assert.equal(path.dirname(path.resolve(directory)), root);
        assert.ok(path.basename(directory).startsWith("campmart-test-"));
        await fs.rm(directory, { recursive: true, force: true });
    });
    const fixtures = {
        "inventory.json": [item], "coupons.json": [inactive, active], "transactions.json": [],
        "admin.json": { username: "tester", password: "test-password" }
    };
    await Promise.all(Object.entries(fixtures).map(([name, value]) =>
        fs.writeFile(path.join(directory, name), JSON.stringify(value))
    ));
    server = createApp({ dataDir: directory, sessionSecret: "test-secret", logger: { error() {} } }).listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = "http://127.0.0.1:" + server.address().port;
    let cookie;
    async function request(url, method = "GET", body) {
        return fetch(base + url, {
            method, redirect: "manual",
            headers: {
                ...(cookie ? { Cookie: cookie } : {}),
                ...(body === undefined ? {} : { "Content-Type": "application/json" })
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
    }
    async function login() {
        const response = await request("/login", "POST", fixtures["admin.json"]);
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true });
        cookie = response.headers.get("set-cookie").split(";")[0];
        return cookie;
    }
    const contents = () => Promise.all(files.map(name => fs.readFile(path.join(directory, name), "utf8")));
    const data = async name => JSON.parse(await fs.readFile(path.join(directory, name), "utf8"));
    const checkout = (items = [{ barcode: item.barcode, quantity: 1 }], extra = {}) =>
        request("/checkout", "POST", { items, mode: "Cash", couponBarcode: null, couponDiscount: 0, ...extra });
    return { directory, request, login, data, contents, checkout, base };
}

test("shop, catalog, QR asset, and shared modules remain available; admin APIs require login", async t => {
    const { request, login } = await setup(t);
    for (const url of ["/", "/login", "/assets/tng.jpeg", "/api.mjs", "/barcode-scanner.mjs"]) {
        assert.equal((await request(url)).status, 200, url);
    }
    assert.deepEqual(await (await request("/inventory")).json(), [item]);
    assert.deepEqual(await (await request("/coupons")).json(), [inactive, active]);
    for (const url of ["/admin", "/admin.html"]) {
        const response = await request(url);
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), "/login");
    }
    for (const [url, method] of [["/transactions", "GET"], ["/inventory", "POST"],
        ["/inventory/00123", "PUT"], ["/inventory/00123", "DELETE"], ["/coupons", "POST"], ["/coupons/00234", "DELETE"]]) {
        assert.equal((await request(url, method)).status, 401);
    }
    assert.equal((await request("/login", "POST", { username: "tester", password: "wrong" })).status, 401);
    const firstCookie = await login();
    assert.equal((await request("/admin.html")).status, 200);
    assert.deepEqual(await (await request("/transactions")).json(), []);
    assert.notEqual(await login(), firstCookie);
    assert.equal((await request("/logout")).status, 302);
    assert.equal((await request("/transactions")).status, 401);
});

test("inventory CRUD keeps the data shape and item identity when its barcode changes", async t => {
    const { request, login, data } = await setup(t);
    await login();
    const fields = { name: "Tea", barcode: "00456", cost: 1.25, price: 2.5, quantity: 8 };
    const response = await request("/inventory", "POST", { ...fields, id: "override", extra: true });
    assert.deepEqual(await response.json(), { id: "00456", ...fields });
    const edited = await request("/inventory/00456", "PUT", { barcode: "00567", quantity: 10, id: "changed" });
    assert.deepEqual(await edited.json(), { id: "00456", ...fields, barcode: "00567", quantity: 10 });
    assert.equal((await request("/inventory/00456", "PUT", { barcode: item.barcode })).status, 409);
    assert.equal((await request("/inventory/missing", "PUT", { quantity: 1 })).status, 404);
    assert.deepEqual(await (await request("/inventory/00456", "DELETE")).json(), { success: true });
    assert.deepEqual(await data("inventory.json"), [item]);
});

test("invalid item input leaves inventory untouched", async t => {
    const { request, login, contents } = await setup(t);
    await login();
    const before = await contents();
    for (const changes of [{ name: " " }, { barcode: null }, { cost: -1 }, { price: "5" },
        { quantity: -1 }, { quantity: 1.5 }, { quantity: Number.MAX_SAFE_INTEGER + 1 }]) {
        assert.equal((await request("/inventory", "POST", { ...item, ...changes })).status, 400);
    }
    assert.equal((await request("/inventory", "POST", item)).status, 409);
    assert.deepEqual(await contents(), before);
});

test("coupon creation, duplicate detection, generated names, and deletion preserve existing behavior", async t => {
    const { request, login, data } = await setup(t);
    await login();
    const response = await request("/coupons", "POST", { barcode: " 00999 ", value: "2.5", name: "ignored", activated: true });
    assert.deepEqual(await response.json(), {
        success: true, coupon: { barcode: "00999", name: "RM2.5 Coupon", value: 2.5, activated: false }
    });
    assert.equal((await request("/coupons", "POST", { barcode: "00999", value: 5 })).status, 409);
    for (const body of [{ value: 5 }, { barcode: "", value: 5 }, { barcode: "x", value: 0 },
        { barcode: "x", value: -1 }, { barcode: "x", value: "Infinity" }]) {
        assert.equal((await request("/coupons", "POST", body)).status, 400);
    }
    assert.equal((await request("/coupons/00999", "DELETE")).status, 200);
    assert.equal((await request("/coupons/00999", "DELETE")).status, 404);
    assert.deepEqual(await data("coupons.json"), [inactive, active]);
});

test("Cash and TNG sales use saved prices, retain transaction format, and clamp stock at zero", async t => {
    const { checkout, data } = await setup(t);
    for (const mode of ["Cash", "TNG"]) {
        assert.equal((await checkout([{ barcode: item.barcode, quantity: 12, price: 0, cost: 0 }], { mode })).status, 200);
    }
    const transactions = await data("transactions.json");
    assert.equal((await data("inventory.json"))[0].quantity, 0);
    assert.equal(transactions.length, 2);
    for (const [index, mode] of ["Cash", "TNG"].entries()) {
        assert.deepEqual(transactions[index].sales, [["Cookies", 12, 36, 60]]);
        assert.equal(transactions[index].mode, mode);
        assert.equal(transactions[index].couponDiscount, 0);
        assert.match(transactions[index].date, /^\d{1,2}-\d{1,2}-\d{4} \d{2}:\d{2}$/);
        assert.deepEqual(Object.keys(transactions[index]), ["date", "sales", "mode", "couponDiscount"]);
    }
});

test("coupon-only purchase, redemption, and repurchase after use keep the activation lifecycle", async t => {
    const { checkout, data } = await setup(t);
    assert.equal((await checkout([{ barcode: inactive.barcode, quantity: 1 }])).status, 200);
    assert.equal((await data("coupons.json"))[0].activated, true);
    assert.equal((await checkout(undefined, { couponBarcode: inactive.barcode, couponDiscount: 10 })).status, 200);
    assert.equal((await data("coupons.json"))[0].activated, false);
    assert.equal((await checkout([{ barcode: inactive.barcode, quantity: 1 }])).status, 200);
    assert.equal((await data("coupons.json"))[0].activated, true);
    const transactions = await data("transactions.json");
    assert.deepEqual(transactions[0].sales, [["RM10 Coupon", 1, 0, 10]]);
    assert.equal(transactions[1].couponDiscount, 10, "keep the full discount even on a RM5 cart");
    assert.equal(transactions[2].couponDiscount, 0);
});

test("mixed item/coupon purchases can use another active coupon without changing accounting", async t => {
    const { checkout, data } = await setup(t);
    assert.equal((await checkout([
        { barcode: item.barcode, quantity: 2 }, { barcode: inactive.barcode, quantity: 1 }
    ], { mode: "TNG", couponBarcode: active.barcode, couponDiscount: 999 })).status, 200);
    assert.deepEqual((await data("transactions.json"))[0].sales, [["Cookies", 2, 6, 10], ["RM10 Coupon", 1, 0, 10]]);
    assert.equal((await data("transactions.json"))[0].couponDiscount, 10, "use the saved coupon value");
    assert.equal((await data("inventory.json"))[0].quantity, 18);
    assert.deepEqual((await data("coupons.json")).map(coupon => coupon.activated), [true, false]);
});

test("bad checkout input cannot partially change stock, coupons, or history", async t => {
    const { request, checkout, contents } = await setup(t);
    const before = await contents();
    for (const body of [undefined, {}, [], { items: [], mode: "Cash" },
        { items: [{ barcode: item.barcode, quantity: 1 }], mode: "Other" },
        ...[0, -1, 1.5, "1"].map(quantity => ({ items: [{ barcode: item.barcode, quantity }], mode: "Cash" }))]) {
        assert.equal((await request("/checkout", "POST", body)).status, 400);
    }
    assert.equal((await checkout([{ barcode: item.barcode, quantity: 1 }, { barcode: "missing", quantity: 1 }])).status, 400);
    assert.equal((await checkout(undefined, { couponBarcode: "missing" })).status, 400);
    assert.equal((await checkout(undefined, { couponBarcode: inactive.barcode })).status, 409);
    assert.equal((await checkout([{ barcode: active.barcode, quantity: 1 }])).status, 409);
    assert.equal((await checkout([{ barcode: inactive.barcode, quantity: 1 }, { barcode: inactive.barcode, quantity: 1 }])).status, 409);
    assert.equal((await checkout([{ barcode: inactive.barcode, quantity: 2 }])).status, 400);
    assert.deepEqual(await contents(), before);
});

test("concurrent checkouts cannot redeem one coupon twice or lose stock updates", async t => {
    const { checkout, data } = await setup(t);
    const responses = await Promise.all([
        checkout(undefined, { couponBarcode: active.barcode }),
        checkout(undefined, { couponBarcode: active.barcode }),
        ...Array.from({ length: 8 }, () => checkout())
    ]);
    assert.equal(responses.filter(response => response.status === 200).length, 9);
    assert.equal(responses.filter(response => response.status === 409).length, 1);
    assert.equal((await data("inventory.json"))[0].quantity, 11);
    const transactions = await data("transactions.json");
    assert.equal(transactions.length, 9);
    assert.equal(transactions.filter(sale => sale.couponDiscount === 10).length, 1);
});

test("a transaction write failure restores both inventory and coupon status, then permits retry", async t => {
    const { checkout, contents, directory, data } = await setup(t);
    const before = await contents();
    const rename = fs.rename;
    let failOnce = true;
    t.mock.method(fs, "rename", async (source, destination) => {
        if (destination === path.join(directory, "transactions.json") && failOnce) {
            failOnce = false;
            throw new Error("simulated I/O failure");
        }
        return rename(source, destination);
    });
    const cart = [{ barcode: item.barcode, quantity: 2 }, { barcode: inactive.barcode, quantity: 1 }];
    const failed = await checkout(cart, { couponBarcode: active.barcode });
    assert.equal(failed.status, 500);
    assert.doesNotMatch((await failed.json()).message, /simulated|I\/O/);
    assert.deepEqual(await contents(), before);
    assert.equal((await checkout(cart, { couponBarcode: active.barcode })).status, 200);
    assert.equal((await data("transactions.json")).length, 1);
    assert.equal((await fs.readdir(directory)).some(name => name.endsWith(".tmp")), false);
});

test("malformed JSON and corrupt stored data produce errors without overwriting other files", async t => {
    const { base, checkout, directory, data } = await setup(t);
    const response = await fetch(base + "/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{"
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).message, "Invalid JSON request");
    await fs.writeFile(path.join(directory, "transactions.json"), "broken json");
    assert.equal((await checkout()).status, 500);
    assert.deepEqual(await data("inventory.json"), [item]);
    assert.deepEqual(await data("coupons.json"), [inactive, active]);
});
