import { requestJson, escapeHtml } from "./api.mjs";
import { createBarcodeScanner, createScanSound } from "./barcode-scanner.mjs";

const scanButton = document.getElementById("scanButton");
const closeButton = document.getElementById("closeScan");
const flipButton = document.getElementById("flipCamera");
const cameraContainer = document.getElementById("cameraContainer");
const video = document.getElementById("video");
const cartItems = document.getElementById("cartItems");
const adminButton = document.getElementById("adminLogin");
const checkoutButton = document.getElementById("checkoutButton");
const couponButton = document.getElementById("couponButton");
const cartActionButtons = document.querySelector(".cart-action-buttons");
const cartTotal = document.getElementById("cartTotal");
const couponDiscount = document.getElementById("couponDiscount");
const nettTotalElement = document.getElementById("nettTotal");
const couponScanMessage = document.getElementById("couponScanMessage");
const clearCartButton = document.getElementById("clearCartButton");
const showTngQr = document.getElementById("showTngQr");
const closeShowQr = document.getElementById("closeShowQr");

const couponCameraModal = document.getElementById("couponCameraModal");
const couponVideo = document.getElementById("couponVideo");
const couponFlipCamera = document.getElementById("couponFlipCamera");
const couponCloseScan = document.getElementById("couponCloseScan");

const checkoutModal = document.getElementById("checkoutModal");
const qrModal = document.getElementById("qrModal");
const cashModal = document.getElementById("cashModal");
const thankYouModal = document.getElementById("thankYouModal");
const showQrModal = document.getElementById("showQrModal");

const couponErrorModal = document.getElementById("couponErrorModal");
const couponErrorMessage = document.getElementById("couponErrorMessage");
const closeCouponError = document.getElementById("closeCouponError");

const payQr = document.getElementById("payQr");
const payCash = document.getElementById("payCash");
const qrPaid = document.getElementById("qrPaid");
const cashPaid = document.getElementById("cashPaid");
const donePayment = document.getElementById("donePayment");
const checkoutTotal = document.getElementById("checkoutTotal");
const cancelCheckout = document.getElementById("cancelCheckout");
const leftPaidArrow = document.querySelector(".paid-arrow-left");
const rightPaidArrow = document.querySelector(".paid-arrow-right");

let inventory = [];
let coupons = [];
let cart = [];
let appliedCoupon = null;
let paymentMode = "";
let paymentPending = false;
let paymentComplete = false;
let nextScanAt = 0;
let itemScanRequest = 0;
let couponScanRequest = 0;
let catalogRequest;
const scanSound = createScanSound();
const itemScanner = createBarcodeScanner(video, barcode => {
    if (acceptScan()) addToCart(barcode);
});
const couponScanner = createBarcodeScanner(couponVideo, barcode => {
    if (!acceptScan()) return;
    couponScanMessage.textContent = "";
    const coupon = findByBarcode(coupons, barcode);
    if (!coupon) {
        couponScanMessage.textContent = "Coupon not found!";
    } else if (coupon.activated === false) {
        couponScanMessage.textContent = "Sorry, this coupon has not been activated yet. Please purchase it first.";
    } else if (appliedCoupon && String(appliedCoupon.barcode).trim() === String(coupon.barcode).trim()) {
        couponScanMessage.textContent = "This coupon has already been applied.";
    } else {
        appliedCoupon = coupon;
        stopCouponScanner();
        renderCart();
    }
});

function findByBarcode(items, barcode) {
    const key = String(barcode).trim();
    return items.find(item => String(item.barcode).trim() === key);
}

function checkoutInProgress() {
    return paymentPending || paymentComplete ||
        [checkoutModal, qrModal, cashModal, thankYouModal].some(modal => modal.classList.contains("show"));
}

function acceptScan() {
    if (Date.now() < nextScanAt || checkoutInProgress()) return false;
    nextScanAt = Date.now() + 2000;
    scanSound.play();
    return true;
}

function loadCatalog() {
    // Share overlapping refreshes and replace both lists together.
    if (!catalogRequest) {
        catalogRequest = Promise.all([requestJson("/inventory"), requestJson("/coupons")])
            .then(([items, vouchers]) => {
                inventory = items;
                coupons = vouchers;
            })
            .finally(() => { catalogRequest = null; });
    }
    return catalogRequest;
}

async function completePayment() {
    if (paymentPending || paymentComplete || cart.length === 0) return;
    paymentPending = true;
    qrPaid.disabled = true;
    cashPaid.disabled = true;
    try {
        await requestJson("/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                items: cart,
                mode: paymentMode,
                couponBarcode: appliedCoupon ? appliedCoupon.barcode : null,
                couponDiscount: appliedCoupon ? appliedCoupon.value : 0
            })
        });
        paymentComplete = true;
        stopScanner();
        qrModal.classList.remove("show");
        cashModal.classList.remove("show");
        thankYouModal.classList.add("show");
    } catch (error) {
        showPaidArrows();
        alert(error.message);
    } finally {
        paymentPending = false;
        qrPaid.disabled = false;
        cashPaid.disabled = false;
    }
}

function showCouponError(message){
    couponErrorMessage.textContent = message;
    couponErrorModal.classList.add("show");
}

function updateCheckoutButton(){
    if(cart.length > 0){
        cartActionButtons.style.display = "flex";
    }
    else{
        cartActionButtons.style.display = "none";
    }
}

function updateTotal(){
    const total = cart.reduce(
        (sum, item) => {
            return sum + (item.price * item.quantity);
        },
        0
    );

    const discount = appliedCoupon ? appliedCoupon.value : 0;

    const nettTotal = Math.max(0, total - discount);

    cartTotal.textContent = `RM ${total.toFixed(2)}`;
    couponDiscount.textContent = `-RM ${discount.toFixed(2)}`;
    nettTotalElement.textContent = `RM ${nettTotal.toFixed(2)}`;
}

function renderCart(){
    cartItems.innerHTML = "";

    if(cart.length === 0){
        cartItems.innerHTML = `
            <div class="empty-cart">
                <img src="/assets/welcomemaltese.gif" alt="Welcome!" class="welcome-gif">
            </div>
        `;

        cartTotal.textContent = "RM 0.00";
        couponDiscount.textContent = "-RM 0.00";
        nettTotalElement.textContent = "RM 0.00";
        cartActionButtons.style.display = "none";
        clearCartButton.style.display = "none";
        return;
    }

    clearCartButton.style.display = "block";

    cart.forEach(item=>{
        const div = document.createElement("div");
        div.className = "cart-item";

        const coupon = coupons.find(
            coupon =>
                String(coupon.barcode).trim() ===
                String(item.barcode).trim()
        );

        const isCoupon = !!coupon;

        div.innerHTML = `
            <div class="cart-item-info">
                <strong>${escapeHtml(item.name)}</strong>
                <br>
                RM ${item.price.toFixed(2)}
            </div>

            <div class="cart-item-controls">
                ${
                    isCoupon
                    ? `
                        <span>
                            1
                        </span>
                    `
                    : `
                        <button data-action="decrease">
                            -
                        </button>

                        <span>
                            ${item.quantity}
                        </span>

                        <button data-action="increase">
                            +
                        </button>
                    `
                }
            </div>

            <div class="cart-item-total">
                RM ${(item.price * item.quantity).toFixed(2)}
            </div>
        `;
        if (!isCoupon) {
            div.querySelector('[data-action="decrease"]').addEventListener("click", () => decreaseQuantity(item.barcode));
            div.querySelector('[data-action="increase"]').addEventListener("click", () => increaseQuantity(item.barcode));
        }
        cartItems.appendChild(div);
    });

    updateTotal();
    updateCheckoutButton();
}

function addToCart(barcode) {
    if (checkoutInProgress()) return;
    const item = findByBarcode(inventory, barcode);
    const coupon = findByBarcode(coupons, barcode);
    if (!item && !coupon) {
        console.log("Item/Coupon not found:", barcode);
        return;
    }
    if (coupon) {
        if (coupon.activated === true) {
            showCouponError("This coupon has already been purchased, please proceed to use it on checkout.");
            return;
        }
        // Each physical coupon has one barcode and is sold with quantity one.
        if (findByBarcode(cart, barcode)) return;
        cart.push({ barcode: coupon.barcode, name: coupon.name, price: coupon.value, quantity: 1 });
    } else {
        const existingItem = findByBarcode(cart, barcode);
        if ((existingItem?.quantity || 0) >= item.quantity) return;
        if (existingItem) existingItem.quantity += 1;
        else cart.push({ barcode: item.barcode, name: item.name, price: item.price, quantity: 1 });
    }
    renderCart();
}

renderCart();

adminButton.addEventListener("click", () => {
    window.location.href = "/login";
});

scanButton.addEventListener("click", async () => {
    const current = ++itemScanRequest;
    scanSound.unlock();
    scanButton.style.display = "none";
    cameraContainer.style.display = "flex";
    flipButton.disabled = true;
    try {
        await loadCatalog();
        if (current !== itemScanRequest) return;
        await itemScanner.start();
    } catch (error) {
        if (current !== itemScanRequest) return;
        stopScanner();
        alert(error.message);
    } finally {
        if (current === itemScanRequest) flipButton.disabled = false;
    }
});

couponButton.addEventListener("click", async () => {
    stopScanner();
    const current = ++couponScanRequest;
    scanSound.unlock();
    couponCameraModal.classList.add("show");
    couponFlipCamera.disabled = true;
    try {
        await loadCatalog();
        if (current !== couponScanRequest) return;
        await couponScanner.start();
    } catch (error) {
        if (current !== couponScanRequest) return;
        stopCouponScanner();
        alert(error.message);
    } finally {
        if (current === couponScanRequest) couponFlipCamera.disabled = false;
    }
});

flipButton.addEventListener("click", async () => {
    if (flipButton.disabled) return;
    const current = ++itemScanRequest;
    flipButton.disabled = true;
    try {
        await itemScanner.flip();
    } catch (error) {
        if (current !== itemScanRequest) return;
        stopScanner();
        alert(error.message);
    } finally {
        if (current === itemScanRequest) flipButton.disabled = false;
    }
});

couponFlipCamera.addEventListener("click", async () => {
    if (couponFlipCamera.disabled) return;
    const current = ++couponScanRequest;
    couponFlipCamera.disabled = true;
    try {
        await couponScanner.flip();
    } catch (error) {
        if (current !== couponScanRequest) return;
        stopCouponScanner();
        alert(error.message);
    } finally {
        if (current === couponScanRequest) couponFlipCamera.disabled = false;
    }
});

closeButton.addEventListener("click", ()=>{
    stopScanner();
});

couponCloseScan.addEventListener("click",() => {
    stopCouponScanner();
});

checkoutButton.addEventListener("click", ()=>{
    checkoutTotal.textContent = nettTotalElement.textContent;
    checkoutModal.classList.add("show");
});

clearCartButton.addEventListener("click", () => {
    if (checkoutInProgress()) return;
    cart = [];
    appliedCoupon = null;
    renderCart();
});

payQr.addEventListener("click",()=>{
    checkoutModal.classList.remove("show");
    qrModal.classList.add("show");
    paymentMode = "TNG";
    showPaidArrows();
});

payCash.addEventListener("click",()=>{
    checkoutModal.classList.remove("show");
    cashModal.classList.add("show");
    paymentMode = "Cash";
    showPaidArrows();
});

qrPaid.addEventListener("click", async () => {
    hidePaidArrows();
    await completePayment();
});

cashPaid.addEventListener("click", async () => {
    hidePaidArrows();
    await completePayment();
});

donePayment.addEventListener("click", async()=>{
    if (!paymentComplete) return;
    hidePaidArrows();
    thankYouModal.classList.remove("show");
    cart = [];
    appliedCoupon = null;
    paymentMode = "";
    paymentComplete = false;
    renderCart();
    await loadCatalog().catch(error => alert(error.message));
});

cancelCheckout.addEventListener("click", ()=>{
    checkoutModal.classList.remove("show");
    hidePaidArrows();
});

closeCouponError.addEventListener("click", ()=>{
    couponErrorModal.classList.remove("show");
});

showTngQr.addEventListener("click", () => {
    showQrModal.classList.add("show");
});

closeShowQr.addEventListener("click", () => {
    showQrModal.classList.remove("show");
});

function stopScanner() {
    itemScanRequest += 1;
    nextScanAt = 0;
    itemScanner.stop();
    cameraContainer.style.display = "none";
    scanButton.style.display = "block";
    flipButton.disabled = false;
}

function stopCouponScanner() {
    couponScanRequest += 1;
    nextScanAt = 0;
    couponScanner.stop();
    couponScanMessage.textContent = "";
    couponCameraModal.classList.remove("show");
    couponFlipCamera.disabled = false;
}

window.addEventListener("pagehide", () => {
    stopScanner();
    stopCouponScanner();
});

function showPaidArrows(){
    leftPaidArrow.style.display = "block";
    rightPaidArrow.style.display = "block";
}

function hidePaidArrows(){
    leftPaidArrow.style.display = "none";
    rightPaidArrow.style.display = "none";
}

function increaseQuantity(barcode){
    if (checkoutInProgress()) return;
    const cartItem = cart.find(
        item => item.barcode === barcode
    );

    const inventoryItem = inventory.find(
        item => String(item.barcode).trim() === String(barcode).trim()
    );

    if(!cartItem || !inventoryItem){
        return;
    }

    if(cartItem.quantity >= inventoryItem.quantity){
        return;
    }

    cartItem.quantity += 1;

    renderCart();
};


function decreaseQuantity(barcode){
    if (checkoutInProgress()) return;
    const itemIndex = cart.findIndex(
        item => item.barcode === barcode
    );

    if(itemIndex === -1){
        return;
    }

    cart[itemIndex].quantity -= 1;


    if(cart[itemIndex].quantity <= 0){
        cart.splice(itemIndex,1);
    }

    renderCart();
};

loadCatalog().catch(error => alert(error.message));
