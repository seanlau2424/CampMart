import { requestJson, escapeHtml } from "./api.mjs";
import { createBarcodeScanner, createScanSound } from "./barcode-scanner.mjs";

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
const transactionsList = document.getElementById("transactionsList");
const totalSales = document.getElementById("totalSales");
const totalProfit = document.getElementById("totalProfit");
const addCouponButton = document.getElementById("addCouponButton");
const couponsList = document.getElementById("couponsList");
const couponModal = document.getElementById("couponModal");
const couponForm = document.getElementById("couponForm");
const couponBarcode = document.getElementById("couponBarcode");
const couponValue = document.getElementById("couponValue");
const couponName = document.getElementById("couponName");
const cancelCoupon = document.getElementById("cancelCoupon");
const deleteCouponModal = document.getElementById("deleteCouponModal");
const cancelDeleteCoupon = document.getElementById("cancelDeleteCoupon");
const confirmDeleteCoupon = document.getElementById("confirmDeleteCoupon");
let deleteCouponBarcode = null;

const saveItemButton = itemForm.querySelector('button[type="submit"]');
const saveCouponButton = couponForm.querySelector('button[type="submit"]');
let deleteId = null;
let inventory = [];
let coupons = [];
let editMode = false;
let editId = null;
let scannerPurpose = "";
let scannerRequest = 0;
const scanSound = createScanSound();
const scanner = createBarcodeScanner(video, barcode => {
    scanSound.play();
    stopBarcodeScanner();
    if (scannerPurpose === "coupon") openCouponModal(barcode);
    else {
        openModal();
        itemBarcode.value = barcode;
    }
});

async function runAction(button, cancel, action) {
    if (button.disabled) return;
    button.disabled = true;
    cancel.disabled = true;
    try {
        await action();
    } catch (error) {
        alert(error.message);
    } finally {
        button.disabled = false;
        cancel.disabled = false;
    }
}

function renderInventory(){
    inventoryGrid.innerHTML = "";

    inventory.forEach(item=>{
        const card = document.createElement("div");
        card.className="item-card";
        card.innerHTML = `
            <div class="item-name">
                ${escapeHtml(item.name)}
            </div>

            <div class="item-info">
                Barcode: ${escapeHtml(item.barcode)}
            </div>

            <div class="item-info">
                Cost: RM ${item.cost.toFixed(2)}
            </div>

            <div class="item-info">
                Price: RM ${item.price.toFixed(2)}
            </div>

            <div class="item-info">
                Stock Quantity: ${escapeHtml(item.quantity)}
            </div>

            <div class="item-actions">
                <button class="edit-btn">Edit</button>
                <button class="delete-btn">Delete</button>
            </div>
        `;
        card.querySelector(".edit-btn").addEventListener("click", () => editItem(item.id));
        card.querySelector(".delete-btn").addEventListener("click", () => deleteItem(item.id));
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

function renderCoupons(){
    couponsList.innerHTML = "";
    coupons.forEach(coupon => {
        const row = document.createElement("div");
        row.className = "coupon-row";
        row.innerHTML = `
            <div class="coupon-summary">

                <div class="coupon-barcode">
                    ${escapeHtml(coupon.barcode)}
                </div>

                <div class="coupon-name">
                    ${escapeHtml(coupon.name)}
                </div>

                <div class="
                    coupon-status
                    ${coupon.activated ? "active" : "inactive"}
                ">
                    Activated = ${escapeHtml(coupon.activated)}
                </div>

                <button class="delete-coupon-btn" data-barcode="${escapeHtml(coupon.barcode)}">
                    x
                </button>
            </div>
        `;

        const deleteButton = row.querySelector(".delete-coupon-btn");

        deleteButton.onclick = () => {
            deleteCouponBarcode =
                coupon.barcode;
            deleteCouponModal.classList.add("show");
        };

        couponsList.appendChild(row);
    });
}

function openCouponModal(barcode){
    couponForm.reset();
    couponBarcode.value = barcode;
    couponModal.classList.add("show");
    couponValue.focus();
}

async function loadInventory(){
    inventory = await requestJson("/inventory");
    renderInventory();
}

async function loadCoupons(){
    coupons = await requestJson("/coupons");
    renderCoupons();
}

async function loadTransactions() {
    const transactions = await requestJson("/transactions");

    let totalSalesValue = 0;
    let totalProfitValue = 0;

    transactionsList.innerHTML = "";

    transactions.forEach(transaction => {

        let sales = 0;
        let profit = 0;

        transaction.sales.forEach(item => {
            sales += item[3];
            profit += item[3] - item[2];
        });

        const couponDiscount = transaction.couponDiscount || 0;
        const finalProfit = profit - couponDiscount;

        totalSalesValue += sales;
        totalProfitValue += finalProfit;

        const row = document.createElement("div");
        row.className = "transaction-row";

        row.innerHTML = `
            <div class="transaction-summary">

                <div class="transaction-date">
                    ${escapeHtml(transaction.date)}
                </div>

                <div class="transaction-sales">
                    RM ${sales.toFixed(2)}
                </div>

                <div class="transaction-profit">
                    RM ${finalProfit.toFixed(2)}
                </div>

                <button class="expand-btn">
                    ▼
                </button>

            </div>

            <div class="transaction-details">

                <table>

                    <tr>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>Cost</th>
                        <th>Sales</th>
                        <th>Profit</th>
                    </tr>

                    ${transaction.sales.map(item=>`
                        <tr>
                            <td>${escapeHtml(item[0])}</td>
                            <td>${escapeHtml(item[1])}</td>
                            <td>RM ${item[2].toFixed(2)}</td>
                            <td>RM ${item[3].toFixed(2)}</td>
                            <td>RM ${(item[3] - item[2]).toFixed(2)}</td>
                        </tr>
                    `).join("")}

                </table>

                <div class="transaction-extra">
                    <div class="transaction-extra-row">
                        <span>Total Coupon Discounts</span>
                        <span>
                            -RM ${couponDiscount.toFixed(2)}
                        </span>
                    </div>

                    <div class="transaction-extra-row transaction-final-profit">
                        <span>Total Profit</span>
                        <span>
                            RM ${finalProfit.toFixed(2)}
                        </span>
                    </div>
                </div>

            </div>
        `;

        const button = row.querySelector(".expand-btn");
        const details = row.querySelector(".transaction-details");

        button.onclick = () => {

            details.classList.toggle("show");

            button.textContent =
                details.classList.contains("show")
                ? "▲"
                : "▼";

        };

        transactionsList.appendChild(row);

    });

    totalSales.textContent =
        `RM ${totalSalesValue.toFixed(2)}`;

    totalProfit.textContent =
        `RM ${totalProfitValue.toFixed(2)}`;

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

async function runScanner(flip = false) {
    const current = ++scannerRequest;
    flipButton.disabled = true;
    try {
        if (flip) await scanner.flip();
        else await scanner.start();
    } catch (error) {
        if (current !== scannerRequest) return;
        stopBarcodeScanner();
        alert(error.message);
    } finally {
        if (current === scannerRequest) flipButton.disabled = false;
    }
}

async function openBarcodeScanner(purpose = "item") {
    scannerPurpose = purpose;
    scanSound.unlock();
    barcodeModal.classList.add("show");
    await runScanner();
}

function openModal(){
    modal.classList.add("show");
    modalTitle.textContent="Add Item";
    itemForm.reset();
    editMode=false;
    editId=null;
}

flipButton.addEventListener("click", () => {
    if (!flipButton.disabled) runScanner(true);
});

function stopBarcodeScanner() {
    scannerRequest += 1;
    scanner.stop();
    barcodeModal.classList.remove("show");
    flipButton.disabled = false;
}

window.addEventListener("pagehide", stopBarcodeScanner);

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

addCouponButton.addEventListener(
    "click",
    () => {
        openBarcodeScanner("coupon");
    }
);

couponValue.addEventListener(
    "input",
    () => {
        const value = Number(couponValue.value);
        if(value > 0){
            couponName.value =
                `RM${value} Coupon`;
        }
        else{
            couponName.value = "";
        }
    }
);

couponForm.addEventListener("submit", async event => {
    event.preventDefault();
    const coupon = {
        barcode: couponBarcode.value,
        name: couponName.value,
        value: Number(couponValue.value),
        activated: false
    };
    await runAction(saveCouponButton, cancelCoupon, async () => {
        await requestJson("/coupons", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(coupon)
        });
        couponModal.classList.remove("show");
        await loadCoupons();
    });
});

cancelCoupon.addEventListener(
    "click",
    () => {
        couponModal.classList.remove("show");
    }
);

itemForm.addEventListener("submit", async event => {
    event.preventDefault();
    const item = {
        name: itemName.value,
        barcode: itemBarcode.value,
        cost: Number(itemCost.value),
        price: Number(itemPrice.value),
        quantity: Number(itemQuantity.value)
    };
    await runAction(saveItemButton, cancelButton, async () => {
        await requestJson(editMode ? `/inventory/${encodeURIComponent(editId)}` : "/inventory", {
            method: editMode ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item)
        });
        closeModal();
        await loadInventory();
    });
});

function editItem(id){
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

function deleteItem(id){
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

confirmDelete.addEventListener("click", async () => {
    if (deleteId === null) return;
    await runAction(confirmDelete, cancelDelete, async () => {
        await requestJson(`/inventory/${encodeURIComponent(deleteId)}`, { method: "DELETE" });
        deleteModal.classList.remove("show");
        deleteId = null;
        await loadInventory();
    });
});

cancelDeleteCoupon.addEventListener(
    "click",
    () => {
        deleteCouponModal.classList.remove("show");
        deleteCouponBarcode = null;
    }
);

confirmDeleteCoupon.addEventListener("click", async () => {
    if (deleteCouponBarcode === null) return;
    await runAction(confirmDeleteCoupon, cancelDeleteCoupon, async () => {
        await requestJson(`/coupons/${encodeURIComponent(deleteCouponBarcode)}`, { method: "DELETE" });
        deleteCouponModal.classList.remove("show");
        deleteCouponBarcode = null;
        await loadCoupons();
    });
});

logoutButton.addEventListener(
    "click",
    ()=>{
        window.location.href="/logout";
    }
);

async function initialize(){
    await Promise.all([loadInventory(), loadCoupons(), loadTransactions()]);
}

initialize().catch(error => alert(error.message));
