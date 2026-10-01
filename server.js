const express = require("express");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const session = require("express-session");
const { createJsonStore } = require("./lib/json-store");

function httpError(status, message) {
    return Object.assign(new Error(message), { status });
}

function requireObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw httpError(400, "A JSON object is required");
    }
}

function barcodeKey(value) {
    return String(value ?? "").trim();
}

function itemFields(body) {
    requireObject(body);
    return Object.fromEntries(
        ["name", "barcode", "cost", "price", "quantity"]
            .filter(field => Object.hasOwn(body, field))
            .map(field => [field, body[field]])
    );
}

function validateItem(item) {
    for (const field of ["name", "barcode"]) {
        if (typeof item[field] !== "string" || !item[field].trim()) {
            throw httpError(400, "Item " + field + " is required");
        }
    }
    for (const field of ["cost", "price"]) {
        if (!Number.isFinite(item[field]) || item[field] < 0) {
            throw httpError(400, "Item " + field + " must be a non-negative number");
        }
    }
    if (!Number.isSafeInteger(item.quantity) || item.quantity < 0) {
        throw httpError(400, "Stock quantity must be a non-negative whole number");
    }
}

function requireAdmin(req, res, next) {
    if (!req.session.loggedIn) {
        return res.status(401).json({ success: false, message: "Please log in first" });
    }
    next();
}

function formatDate(now) {
    return `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()} ` +
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function createApp({
    dataDir = __dirname,
    sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString("hex"),
    logger = console
} = {}) {
    const app = express();
    const store = createJsonStore(path.resolve(dataDir));
    const publicDir = path.join(__dirname, "public");

    app.disable("x-powered-by");
    app.use(express.json());
    app.use(session({
        secret: sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true, sameSite: "lax" }
    }));

    app.get("/", (req, res) => res.sendFile(path.join(publicDir, "app.html")));
    app.get("/login", (req, res) => res.sendFile(path.join(publicDir, "login.html")));
    app.get("/logout", (req, res, next) => {
        req.session.destroy(error => {
            if (error) return next(error);
            res.clearCookie("connect.sid");
            res.redirect("/");
        });
    });

    app.get(["/admin", "/admin.html"], (req, res) => {
        res.set("Cache-Control", "no-store");
        if (!req.session.loggedIn) return res.redirect("/login");
        res.sendFile(path.join(publicDir, "admin.html"));
    });

    for (const name of ["inventory", "coupons"]) {
        app.get("/" + name, async (req, res) => {
            res.set("Cache-Control", "no-store");
            res.json(await store.read(name + ".json"));
        });
    }
    app.get("/transactions", requireAdmin, async (req, res) => {
        res.set("Cache-Control", "no-store");
        res.json(await store.read("transactions.json"));
    });

    app.post("/login", async (req, res, next) => {
        requireObject(req.body);
        const { username, password } = req.body;
        const credentials = await store.read("admin.json");
        if (typeof username !== "string" || typeof password !== "string" ||
            username !== credentials.username || password !== credentials.password) {
            return res.status(401).json({ success: false, message: "Invalid username or password" });
        }
        req.session.regenerate(error => {
            if (error) return next(error);
            req.session.loggedIn = true;
            req.session.save(saveError => {
                if (saveError) return next(saveError);
                res.json({ success: true });
            });
        });
    });

    app.post("/inventory", requireAdmin, async (req, res) => {
        const fields = itemFields(req.body);
        validateItem(fields);
        const newItem = { id: fields.barcode, ...fields };
        await store.update(["inventory.json"], inventory => {
            if (inventory.some(item => barcodeKey(item.barcode) === barcodeKey(newItem.barcode) || item.id === newItem.id)) {
                throw httpError(409, "An item with this barcode already exists");
            }
            inventory.push(newItem);
        });
        res.json(newItem);
    });

    app.put("/inventory/:id", requireAdmin, async (req, res) => {
        const fields = itemFields(req.body);
        const updated = await store.update(["inventory.json"], inventory => {
            const index = inventory.findIndex(item => item.id === req.params.id);
            if (index === -1) throw httpError(404, "Item not found");
            // Keep the ID stable when the barcode is edited.
            const item = { ...inventory[index], ...fields };
            validateItem(item);
            if (inventory.some((other, otherIndex) =>
                otherIndex !== index && barcodeKey(other.barcode) === barcodeKey(item.barcode))) {
                throw httpError(409, "An item with this barcode already exists");
            }
            inventory[index] = item;
            return item;
        });
        res.json(updated);
    });

    app.delete("/inventory/:id", requireAdmin, async (req, res) => {
        await store.update(["inventory.json"], inventory => {
            for (let index = inventory.length - 1; index >= 0; index -= 1) {
                if (inventory[index].id === req.params.id) inventory.splice(index, 1);
            }
        });
        res.json({ success: true });
    });

    app.post("/coupons", requireAdmin, async (req, res) => {
        requireObject(req.body);
        const barcode = barcodeKey(req.body.barcode);
        const value = Number(req.body.value);
        if (!barcode || !["string", "number"].includes(typeof req.body.barcode)) {
            throw httpError(400, "Barcode is required");
        }
        if (!Number.isFinite(value) || value <= 0) {
            throw httpError(400, "Coupon value must be greater than 0");
        }
        const coupon = { barcode, name: `RM${value} Coupon`, value, activated: false };
        await store.update(["coupons.json"], coupons => {
            if (coupons.some(other => barcodeKey(other.barcode) === barcode)) {
                throw httpError(409, "A coupon with this barcode already exists");
            }
            coupons.push(coupon);
        });
        res.json({ success: true, coupon });
    });

    app.delete("/coupons/:barcode", requireAdmin, async (req, res) => {
        await store.update(["coupons.json"], coupons => {
            const originalLength = coupons.length;
            for (let index = coupons.length - 1; index >= 0; index -= 1) {
                if (barcodeKey(coupons[index].barcode) === barcodeKey(req.params.barcode)) coupons.splice(index, 1);
            }
            if (coupons.length === originalLength) throw httpError(404, "Coupon not found");
        });
        res.json({ success: true });
    });

    app.post("/checkout", async (req, res) => {
        requireObject(req.body);
        const { items, mode } = req.body;
        if (!Array.isArray(items) || items.length === 0) throw httpError(400, "Your cart is empty");
        if (mode !== "Cash" && mode !== "TNG") throw httpError(400, "Invalid payment mode");
        for (const item of items) {
            requireObject(item);
            if (!["string", "number"].includes(typeof item.barcode) || !barcodeKey(item.barcode) ||
                !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
                throw httpError(400, "Each cart item needs a barcode and a positive whole quantity");
            }
        }

        await store.update(["inventory.json", "coupons.json", "transactions.json"], (inventory, coupons, transactions) => {
            const redeemBarcode = barcodeKey(req.body.couponBarcode);
            const usedCoupon = redeemBarcode
                ? coupons.find(coupon => barcodeKey(coupon.barcode) === redeemBarcode)
                : null;
            if (redeemBarcode && !usedCoupon) throw httpError(400, "Coupon not found");
            if (usedCoupon && usedCoupon.activated !== true) {
                throw httpError(409, "This coupon has not been activated. Please purchase it first.");
            }
            // Match the existing full-value discount, including when it exceeds
            // the cart total. Use the saved value rather than trusting the client.
            const couponDiscount = usedCoupon ? usedCoupon.value : 0;
            const purchasedCoupons = new Set();
            const sales = items.map(cartItem => {
                const barcode = barcodeKey(cartItem.barcode);
                const coupon = coupons.find(entry => barcodeKey(entry.barcode) === barcode);
                if (coupon) {
                    if (coupon.activated || purchasedCoupons.has(barcode)) {
                        throw httpError(409, "This coupon has already been purchased");
                    }
                    if (cartItem.quantity !== 1) throw httpError(400, "A coupon can only be purchased once per checkout");
                    purchasedCoupons.add(barcode);
                    coupon.activated = true;
                    return [coupon.name, 1, 0, coupon.value];
                }
                const item = inventory.find(entry => barcodeKey(entry.barcode) === barcode);
                if (!item) throw httpError(400, "Item not found: " + barcode);
                const cost = item.cost * cartItem.quantity;
                const price = item.price * cartItem.quantity;
                if (!Number.isFinite(cost) || !Number.isFinite(price)) {
                    throw httpError(400, "Item totals are too large");
                }
                // Keep the current checkout stock policy.
                item.quantity = Math.max(0, item.quantity - cartItem.quantity);
                return [item.name, cartItem.quantity, cost, price];
            });
            if (usedCoupon) usedCoupon.activated = false;
            transactions.push({ date: formatDate(new Date()), sales, mode, couponDiscount });
        });
        res.json({ success: true });
    });

    app.use(express.static(publicDir, { maxAge: "5m" }));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        const status = error.status >= 400 && error.status < 500 ? error.status : 500;
        if (status === 500) logger.error("Request failed:", error);
        const message = error.type === "entity.parse.failed" ? "Invalid JSON request"
            : status === 500 ? "Unable to complete the request. Please try again." : error.message;
        res.status(status).json({ success: false, message });
    });

    return app;
}

if (require.main === module) {
    const port = process.env.PORT || 3001;
    createApp().listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

module.exports = { createApp };
