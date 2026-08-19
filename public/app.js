import { BrowserMultiFormatReader } 
from "https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm";

import {
    DecodeHintType,
    BarcodeFormat
} from "https://cdn.jsdelivr.net/npm/@zxing/library@latest/+esm";

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
const couponDiscountRow = document.getElementById("couponDiscountRow");
const couponDiscount = document.getElementById("couponDiscount");
const nettTotalElement = document.getElementById("nettTotal");
const couponScanMessage = document.getElementById("couponScanMessage");
const clearCartButton = document.getElementById("clearCartButton");

const couponCameraModal = document.getElementById("couponCameraModal");
const couponVideo = document.getElementById("couponVideo");
const couponFlipCamera = document.getElementById("couponFlipCamera");
const couponCloseScan = document.getElementById("couponCloseScan");

const checkoutModal = document.getElementById("checkoutModal");
const qrModal = document.getElementById("qrModal");
const cashModal = document.getElementById("cashModal");
const thankYouModal = document.getElementById("thankYouModal");

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

let scanCooldown = false;
let controls;
let stream;
let inventory = [];
let coupons = [];
let cart = [];
let appliedCoupon = null;
let currentFacingMode = "environment"; 
let paymentMode = "";
let couponStream;
let couponControls;
let couponFacingMode = "environment";
let couponMessageTimeout;

let scanSound = new Audio("/assets/barcode-scan-sound.mp3");
scanSound.volume = 0.7;

const hints = new Map();
hints.set(
    DecodeHintType.TRY_HARDER,
    true
);

hints.set(
    DecodeHintType.POSSIBLE_FORMATS,
    [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A
    ]
);

const itemCodeReader = new BrowserMultiFormatReader(hints);
const couponCodeReader = new BrowserMultiFormatReader(hints);

const originalWarn = console.warn;
console.warn = (...args) => {
    if (
        args[0]?.includes?.("MultiFormatReader: non-ReaderException from reader")
    ) {
        return;
    }
    originalWarn(...args);
};

async function startCamera(){
    if(stream){
        stream.getTracks().forEach(track=>{
            track.stop();
        });

        stream = null;
    }

    video.srcObject = null;

    const constraints = {
        video:{
            width:{
                ideal:1920
            },
            height:{
                ideal:1080
            },
            facingMode:{
                exact:currentFacingMode
            }
        }
    };

    stream = await navigator.mediaDevices.getUserMedia(
        constraints
    );

    video.srcObject = stream;
    await new Promise(resolve => {
        if(video.readyState >= 2){
            resolve();
        }
        else{
            video.onloadedmetadata = () => {
                resolve();
            };
        }
    });

    await video.play();
}

async function startCouponCamera(){
    if(couponStream){
        couponStream.getTracks().forEach(track => {
            track.stop();
        });
    }

    const constraints = {
        video: {
            width: {
                ideal: 1920
            },
            height: {
                ideal: 1080
            },
            facingMode: {
                exact: couponFacingMode
            }
        }
    };

    couponStream =
        await navigator.mediaDevices.getUserMedia(
            constraints
        );

    couponVideo.srcObject = couponStream;
    await couponVideo.play();
}

async function loadInventory(){
    const response = await fetch("/inventory");
    inventory = await response.json();
}

async function loadCoupons(){
    const response = await fetch("/coupons");
    coupons = await response.json();
}

async function completePayment(){
    await fetch("/checkout",{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body:JSON.stringify({
            items:cart,
            mode:paymentMode,
            couponBarcode: appliedCoupon
                ? appliedCoupon.barcode
                : null,
            couponDiscount: appliedCoupon
                ? appliedCoupon.value
                : 0
        })
    });
    await stopScanner()
    qrModal.classList.remove("show");
    cashModal.classList.remove("show");
    thankYouModal.classList.add("show");
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
                <strong>${item.name}</strong>
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
                        <button onclick="decreaseQuantity('${item.barcode}')">
                            -
                        </button>

                        <span>
                            ${item.quantity}
                        </span>

                        <button onclick="increaseQuantity('${item.barcode}')">
                            +
                        </button>
                    `
                }
            </div>

            <div class="cart-item-total">
                RM ${(item.price * item.quantity).toFixed(2)}
            </div>
        `;
        cartItems.appendChild(div);
    });

    updateTotal();
    updateCheckoutButton();
}

function addToCart(barcode){
    const item = inventory.find(
        item => String(item.barcode).trim() === String(barcode).trim()
    );

    const coupon = coupons.find(
        coupon => String(coupon.barcode).trim() === String(barcode).trim()
    );

    if(!item && !coupon){
        console.log("Item/Coupon not found:", barcode);
        return;
    }

    if (item && !coupon) {
        const existingItem = cart.find(
            cartItem => cartItem.barcode === barcode
        );

        if(existingItem){
            const inventoryItem = inventory.find(
                item => String(item.barcode).trim() === String(barcode).trim()
            );
            if(existingItem.quantity >= inventoryItem.quantity){
                return;
            }
            existingItem.quantity += 1;
        }
        else{
            cart.push({
                barcode:item.barcode,
                name:item.name,
                price:item.price,
                quantity:1
            });
        }
    }
    else {
        if (coupon.activated == true) {
            showCouponError("This coupon has already been purchased, please proceed to use it on checkout.");
            return;
        }
        else {
            cart.push({
                barcode:coupon.barcode,
                name:coupon.name,
                price:coupon.value,
                quantity:1
            });
        }
    }
    
    renderCart();
}

await loadInventory();
await loadCoupons();
renderCart();

adminButton.addEventListener("click", () => {
    window.location.href = "/login";
});

scanButton.addEventListener("click", async () => {
    try {
        scanSound.play();
        scanSound.pause();
        scanSound.currentTime = 0;
    }
    catch(e) {
        console.log("Audio unlock failed:", e);
    }

    scanButton.style.display = "none";
    cameraContainer.style.display = "flex";

    try {
        await startCamera();
        controls =
            await itemCodeReader.decodeFromVideoElement(
                video,
                (result, error) => {
                    if(result && !scanCooldown){
                        scanCooldown = true;
                        const barcode = result.getText();
                        scanSound.currentTime = 0;

                        scanSound.play().catch(err => {
                            console.log(
                                "Scan sound blocked:",
                                err
                            );
                        });

                        addToCart(barcode);

                        setTimeout(() => {
                            scanCooldown = false;
                        }, 2000);
                    }
                }
            );
    }
    catch(error){
        console.error("Item camera failed:", error);
        stopScanner();
    }
});

couponButton.addEventListener("click", async () => {
    stopScanner();
    couponCameraModal.classList.add("show");
    try {
        await startCouponCamera();
        couponControls =
            await couponCodeReader.decodeFromVideoElement(
                couponVideo,
                (result, error) => {
                    if(result && !scanCooldown){
                        scanCooldown = true;
                        couponScanMessage.textContent = "";
                        const barcode = result.getText();
                        scanSound.currentTime = 0;
                        scanSound.play().catch(err => {
                            console.log(
                                "Scan sound blocked:",
                                err
                            );
                        });

                        const coupon = coupons.find(
                            coupon => String(coupon.barcode).trim() === String(barcode).trim()
                        );

                        if(!coupon){
                            couponScanMessage.textContent = "Coupon not found!";
                        }
                        else if(coupon.activated === false){
                            couponScanMessage.textContent = "Sorry, this coupon has not been activated yet. Please purchase it first.";
                        }
                        else if(
                            appliedCoupon &&
                            String(appliedCoupon.barcode).trim() ===
                            String(coupon.barcode).trim()
                        ){
                            couponScanMessage.textContent =
                                "This coupon has already been applied.";
                        }
                        else {
                            appliedCoupon = coupon;
                            couponScanMessage.textContent = "";
                            stopCouponScanner();
                            renderCart();
                        }
                        setTimeout(() => {
                            scanCooldown = false;
                        }, 2000);
                    }
                }
            );
    } catch(error){
        console.error(
            "Coupon camera failed:",
            error
        );
        stopCouponScanner();
    }
});

flipButton.addEventListener("click", async()=>{
    currentFacingMode =
        currentFacingMode === "environment"
        ? "user"
        : "environment";
    await startCamera();
});

couponFlipCamera.addEventListener("click",async () => {
    couponFacingMode =
        couponFacingMode === "environment"
            ? "user"
            : "environment";
    await startCouponCamera();
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
    hidePaidArrows();
    thankYouModal.classList.remove("show");
    cart = [];
    appliedCoupon = null;
    paymentMode = "";
    renderCart();
    await loadInventory();
    await loadCoupons();
});

cancelCheckout.addEventListener("click", ()=>{
    checkoutModal.classList.remove("show");
    hidePaidArrows();
});

closeCouponError.addEventListener("click", ()=>{
    couponErrorModal.classList.remove("show");
});

function stopScanner(){
    if(controls){
        controls.stop();
        controls = null;
    }
    if(stream){
        stream.getTracks().forEach(track => {
            track.stop();
        });
        stream = null;
    }
    video.pause();
    video.srcObject = null;
    cameraContainer.style.display = "none";
    scanButton.style.display = "block";
}

function stopCouponScanner(){
    if(couponControls){
        couponControls.stop();
        couponControls = null;
    }

    if(couponStream){
        couponStream.getTracks().forEach(track => {
            track.stop();
        });

        couponStream = null;
    }

    couponVideo.srcObject = null;
    couponScanMessage.textContent = "";
    couponCameraModal.classList.remove("show");
}

function showPaidArrows(){
    leftPaidArrow.style.display = "block";
    rightPaidArrow.style.display = "block";
}

function hidePaidArrows(){
    leftPaidArrow.style.display = "none";
    rightPaidArrow.style.display = "none";
}

window.increaseQuantity = function(barcode){
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


window.decreaseQuantity = function(barcode){
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