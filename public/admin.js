const inventoryGrid = document.getElementById("inventoryGrid");
const totalItems = document.getElementById("totalItems");
const lastItem = document.getElementById("lastItem");
const modal = document.getElementById("itemModal");
const modalTitle = document.getElementById("modalTitle");
const itemForm = document.getElementById("itemForm");
const itemName = document.getElementById("itemName");
const itemBarcode = document.getElementById("itemBarcode");
const itemCost = document.getElementById("itemCost");
const itemPrice = document.getElementById("itemPrice");
const itemQuantity = document.getElementById("itemQuantity");
const cancelButton = document.getElementById("cancelButton");
const logoutButton = document.getElementById("logoutButton");
const deleteModal = document.getElementById("deleteModal");
const cancelDelete = document.getElementById("cancelDelete");
const confirmDelete = document.getElementById("confirmDelete");
const barcodeModal = document.getElementById("barcodeModal");
const video = document.getElementById("video");
const cancelScan = document.getElementById("cancelScan");
const flipButton = document.getElementById("flipCamera");

import { BrowserMultiFormatReader } 
from "https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm";

import {
    DecodeHintType,
    BarcodeFormat
} from "https://cdn.jsdelivr.net/npm/@zxing/library@latest/+esm";

let deleteId = null;
let inventory = [];
let editMode = false;
let editId = null;
let barcodeScanner;
let scannerControls;
let stream;
let currentFacingMode = "environment";

let scanSound = new Audio("/assets/barcode-scan-sound.mp3");
scanSound.volume = 0.7;
scanSound.preload = "auto";

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

barcodeScanner = new BrowserMultiFormatReader(hints);

function renderInventory(){
    inventoryGrid.innerHTML = "";

    inventory.forEach(item=>{
        const card = document.createElement("div");
        card.className="item-card";
        card.innerHTML = `
            <div class="item-name">
                ${item.name}
            </div>

            <div class="item-info">
                Barcode: ${item.barcode}
            </div>

            <div class="item-info">
                Cost: RM ${item.cost.toFixed(2)}
            </div>

            <div class="item-info">
                Price: RM ${item.price.toFixed(2)}
            </div>

            <div class="item-info">
                Stock Quantity: ${item.quantity}
            </div>

            <div class="item-actions">
                <button class="edit-btn" onclick="editItem('${item.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteItem('${item.id}')">Delete</button>
            </div>
        `;
        inventoryGrid.appendChild(card);
    });

    const addCard = document.createElement("div");
    addCard.className="add-card";
    addCard.innerHTML=`
        <div class="add-plus">
            +
        </div>

        <div class="add-text">
            Add New Item
        </div>
    `;

    addCard.onclick=()=>{
        openBarcodeScanner();
    };

    inventoryGrid.appendChild(addCard);
    updateDashboard();
}

async function loadInventory(){
    const response = await fetch("/inventory");
    inventory = await response.json();
    renderInventory();
}

function updateDashboard(){
    totalItems.textContent = inventory.length;

    if(inventory.length>0){
        lastItem.textContent =
            inventory[inventory.length-1].name;
    }
    else{
        lastItem.textContent="-";
    }
}

async function startBarcodeCamera(){
    if(stream){
        stream
            .getTracks()
            .forEach(track=>{
                track.stop();
            });
    }

    stream =
        await navigator.mediaDevices.getUserMedia({
            video:{
                width:{
                    ideal:1920
                },
                height:{
                    ideal:1080
                },
                facingMode:{
                    exact: currentFacingMode
                }
            }
        });
    video.srcObject = stream;
    await video.play();
}

async function openBarcodeScanner(){
    try{
        scanSound.play();
        scanSound.pause();
        scanSound.currentTime = 0;
    }
    catch(e){
        console.log("Audio unlock failed:", e);
    }

    barcodeModal.classList.add("show");

    await startBarcodeCamera();

    scannerControls =
        await barcodeScanner.decodeFromVideoElement(
            video,
            (result,error)=>{
                if(result){
                    const barcode = result.getText();
                    scanSound.currentTime = 0;
                    scanSound.play().catch(err=>{
                        console.log("Scan sound blocked:", err);
                    });
                    stopBarcodeScanner();
                    openModal();
                    itemBarcode.value = barcode;
                }
            }
        );
}

function openModal(){
    modal.classList.add("show");
    modalTitle.textContent="Add Item";
    itemForm.reset();
    editMode=false;
    editId=null;
}

flipButton.addEventListener("click", async()=>{
    currentFacingMode =
        currentFacingMode === "environment"
        ? "user"
        : "environment";

    if(scannerControls){
        scannerControls.stop();
    }

    await startBarcodeCamera();

    scannerControls =
        await barcodeScanner.decodeFromVideoElement(
            video,
            (result,error)=>{
                if(result){

                    const barcode = result.getText();

                    scanSound.currentTime = 0;
                    scanSound.play().catch(err=>{
                        console.log("Scan sound blocked:", err);
                    });

                    stopBarcodeScanner();

                    openModal();

                    itemBarcode.value = barcode;
                }
            }
        );
});

function stopBarcodeScanner(){
    if(scannerControls){
        scannerControls.stop();
    }
    if(stream){
        stream
        .getTracks()
        .forEach(track=>{
            track.stop();
        });
    }
    video.srcObject=null;
    barcodeModal.classList.remove("show");
}

function closeModal(){
    modal.classList.remove("show");
}

cancelButton.addEventListener(
    "click",
    closeModal
);

cancelScan.addEventListener(
    "click",
    ()=>{
        stopBarcodeScanner();
    }
);

itemForm.addEventListener(
"submit",
async e=>{
    e.preventDefault();

    const item = {
        name:itemName.value,
        barcode:itemBarcode.value,
        cost: Number(itemCost.value),
        price:Number(itemPrice.value),
        quantity:Number(itemQuantity.value)
    };

    if(editMode){
        await fetch(
            `/inventory/${editId}`,
            {
                method:"PUT",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify(item)
            }
        );
    }
    else{
        await fetch(
            "/inventory",
            {
                method:"POST",
                headers:{
                    "Content-Type":"application/json"
                },
                body:JSON.stringify(item)
            }
        );
    }

    closeModal();
    await loadInventory();
});

window.editItem=function(id){
    const item =
        inventory.find(
            x=>x.id===id
        );

    if(!item)return;

    editMode=true;
    editId=id;

    modalTitle.textContent="Edit Item";
    itemName.value=item.name;
    itemBarcode.value=item.barcode;
    itemCost.value=item.cost;
    itemPrice.value=item.price;
    itemQuantity.value=item.quantity;

    modal.classList.add("show");
};

window.deleteItem=function(id){
    deleteId = id;
    deleteModal.classList.add("show");
};

cancelDelete.addEventListener(
    "click",
    ()=>{
        deleteModal.classList.remove("show");
        deleteId = null;
    }
);

confirmDelete.addEventListener(
"click",
async ()=>{
    await fetch(
        `/inventory/${deleteId}`,
        {
            method:"DELETE"
        }
    );
    deleteModal.classList.remove("show");
    deleteId=null;
    await loadInventory();
});

logoutButton.addEventListener(
    "click",
    ()=>{
        window.location.href="/logout";
    }
);

loadInventory();