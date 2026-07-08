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

let scanCooldown = false;
let controls;
let stream;
let cart = [];

let currentFacingMode = "user"; 

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
                exact:currentFacingMode
            }
        }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
}

function renderCart(){
    cartItems.innerHTML = "";
    cart.forEach(item=>{
        const div = document.createElement("div");
        div.className = "cart-item";
        div.innerHTML = `
            <span>
                Barcode ID: ${item.barcode}
            </span>
        `;
        cartItems.appendChild(div);
    });
}

function addToCart(barcode){
    cart.push({
        barcode: barcode
    });
    renderCart();
}

await startCamera();

scanButton.addEventListener("click", async () => {
    scanButton.style.display = "none";
    cameraContainer.style.display = "flex";
    controls = await codeReader.decodeFromVideoElement(
        video,
        (result, error)=>{
            if(result && !scanCooldown){
                scanCooldown = true
                let barcode = result.getText();
                console.log("Barcode ID:", barcode);
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