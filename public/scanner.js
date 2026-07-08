import { BrowserMultiFormatReader } 
from "https://cdn.jsdelivr.net/npm/@zxing/browser@latest/+esm";

const scanButton = document.getElementById("scanButton");
const closeButton = document.getElementById("closeScan");
const cameraContainer = document.getElementById("cameraContainer");
const video = document.getElementById("video");
const codeReader = new BrowserMultiFormatReader();
let controls;

const originalWarn = console.warn;
console.warn = (...args) => {
    if (
        args[0]?.includes?.("MultiFormatReader: non-ReaderException from reader")
    ) {
        return;
    }
    originalWarn(...args);
};

scanButton.addEventListener("click", async () => {
    scanButton.style.display = "none";
    cameraContainer.style.display = "flex";
    controls = await codeReader.decodeFromVideoDevice(
        undefined,
        video,
        (result, error)=>{
            if(result){
                console.log(
                    "Barcode ID:", result.getText()
                );
                alert(`Barcode ID: ${result.getText()}`)
            }
        }
    );
});

closeButton.addEventListener("click", ()=>{
    stopScanner();
});

function stopScanner(){
    if(controls){
        controls.stop();
    }
    cameraContainer.style.display="none";
    scanButton.style.display="block";
}