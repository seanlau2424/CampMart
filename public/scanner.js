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
const checkoutModal = document.getElementById("checkoutModal");
const checkoutTotal = document.getElementById("checkoutTotal");
const paidButton = document.getElementById("paidButton");
const cancelCheckout = document.getElementById("cancelCheckout");

let scanCooldown = false;
let controls;
let stream;
let inventory = [];
let cart = [];
let currentFacingMode = "user"; 

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
const codeReader = new BrowserMultiFormatReader(hints);

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
    }

    const constraints = {
        video:{
            width:{
                ideal:1920
            },
            height:{
                ideal:1080
            },
            facingMode:{
                //exact:currentFacingMode
                ideal: currentFacingMode
            }
        }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
}

async function loadInventory(){
    const response = await fetch("/inventory");
    inventory = await response.json();
}

function updateCheckoutButton(){
    if(cart.length > 0){
        checkoutButton.style.display = "block";
    }
    else{
        checkoutButton.style.display = "none";
    }
}

function updateTotal(){
    const total = cart.reduce(
        (sum,item)=>{
            return sum + (item.price * item.quantity);
        },
        0
    );

    document.querySelector(".cart-total span:last-child")
        .textContent = 
        `RM ${total.toFixed(2)}`;
}

function renderCart(){
    cartItems.innerHTML = "";

    cart.forEach(item=>{
        const div = document.createElement("div");
        div.className = "cart-item";

        div.innerHTML = `
            <div class="cart-item-info">
                <strong>${item.name}</strong>
                <br>
                RM ${item.price.toFixed(2)}
            </div>

            <div class="cart-item-controls">
                <button onclick="decreaseQuantity('${item.barcode}')">
                    -
                </button>

                <span>
                    ${item.quantity}
                </span>

                <button onclick="increaseQuantity('${item.barcode}')">
                    +
                </button>
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
        item => item.barcode === barcode
    );

    if(!item){
        console.log("Item not found:", barcode);
        return;
    }

    const existingItem = cart.find(
        cartItem => cartItem.barcode === barcode
    );

    if(existingItem){
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
    renderCart();
}

await loadInventory();
await startCamera();

adminButton.addEventListener("click", () => {
    window.location.href = "/login";
});

scanButton.addEventListener("click", async () => {
    try {
        scanSound.play();
        scanSound.pause();
        scanSound.currentTime = 0;
    } catch (e) {
        console.log("Audio unlock failed:", e);
    }

    scanButton.style.display = "none";
    cameraContainer.style.display = "flex";

    controls = await codeReader.decodeFromVideoElement(
        video,
        (result, error)=>{
            if(result && !scanCooldown){
                scanCooldown = true;

                let barcode = result.getText();

                scanSound.currentTime = 0;
                scanSound.play().catch(err=>{
                    console.log("Scan sound blocked:", err);
                });

                addToCart(barcode);

                setTimeout(()=>{
                    scanCooldown = false;
                }, 2000);
            }
        }
    );
});

flipButton.addEventListener("click", async()=>{
    currentFacingMode =
        currentFacingMode === "user"
        ? "environment"
        : "user";
    await startCamera();
});

closeButton.addEventListener("click", ()=>{
    stopScanner();
});

checkoutButton.addEventListener("click", ()=>{
    checkoutTotal.textContent =
        document.querySelector(".cart-total span:last-child").textContent;

    checkoutModal.classList.add("show");
});

paidButton.addEventListener("click", ()=>{
    cart = [];
    renderCart();
    checkoutModal.classList.remove("show");
});

cancelCheckout.addEventListener("click", ()=>{
    checkoutModal.classList.remove("show");
});

function stopScanner(){
    if(controls){
        controls.stop();
    }
    if(stream){
        stream.getTracks()
        .forEach(track=>{
            track.stop();
        });
        video.srcObject=null;
    }
    cameraContainer.style.display="none";
    scanButton.style.display="block";
}

window.increaseQuantity = function(barcode){
    const item = cart.find(
        item => item.barcode === barcode
    );

    if(item){
        item.quantity += 1;
    }

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