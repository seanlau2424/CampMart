const express = require("express");
const path = require("path");
const fs = require("fs");
const session = require("express-session");

const PORT = 3001;
const app = express();

app.use(express.json());
app.use(session({
    secret: "youth-camp-mart-secret",
    resave: false,
    saveUninitialized: false
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "app.html"));
});

app.get("/login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/logout", (req, res)=>{
    req.session.destroy(()=>{
        res.redirect("/");
    });
});

app.get("/admin", (req, res) => {
    if (!req.session.loggedIn) {
        return res.redirect("/login");
    }
    res.sendFile(
        path.join(__dirname, "public", "admin.html")
    );
});

app.get("/inventory", (req, res)=>{
    const inventory = JSON.parse(
        fs.readFileSync("inventory.json","utf8")
    );
    res.json(inventory);
});

app.get("/transactions", (req, res) => {
    const transactions = JSON.parse(
        fs.readFileSync("transactions.json", "utf8")
    );
    res.json(transactions);
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const credentials = JSON.parse(fs.readFileSync("admin.json", "utf8"));
    if (username === credentials.username && password === credentials.password) {
        req.session.loggedIn = true;
        return res.json({
            success: true
        });
    }
    res.status(401).json({
        success: false,
        message: "Invalid username or password"
    });
});

app.post("/inventory",(req,res)=>{
    const inventory = JSON.parse(
        fs.readFileSync("inventory.json","utf8")
    );

    const newItem = {
        id: req.body.barcode,
        ...req.body
    };

    inventory.push(newItem);

    fs.writeFileSync(
        "inventory.json",
        JSON.stringify(inventory,null,2)
    );

    res.json(newItem);
});

app.put("/inventory/:id",(req,res)=>{
    const inventory = JSON.parse(
        fs.readFileSync("inventory.json","utf8")
    );

    const id = req.params.id;

    const index = inventory.findIndex(
        item=>item.id===id
    );

    if(index === -1){
        return res.status(404).json({
            message:"Item not found"
        });
    }

    inventory[index] = {
        ...inventory[index],
        ...req.body
    };

    fs.writeFileSync(
        "inventory.json",
        JSON.stringify(inventory,null,2)
    );

    res.json(inventory[index]);
});

app.delete("/inventory/:id",(req,res)=>{
    let inventory = JSON.parse(
        fs.readFileSync("inventory.json","utf8")
    );

    const id = req.params.id;

    inventory = inventory.filter(
        item=>item.id!==id
    );

    fs.writeFileSync(
        "inventory.json",
        JSON.stringify(inventory,null,2)
    );

    res.json({
        success:true
    });
});

app.post("/checkout", (req,res)=>{
    const purchasedItems = req.body.items;
    const paymentMode = req.body.mode;

    const inventory = JSON.parse(
        fs.readFileSync("inventory.json","utf8")
    );

    const transactions = JSON.parse(
        fs.readFileSync("transactions.json","utf8")
    );

    const sales = [];

    purchasedItems.forEach(cartItem=>{
        const item = inventory.find(
            inventoryItem => inventoryItem.barcode === cartItem.barcode
        );

        if(item){
            item.quantity -= cartItem.quantity;
            if(item.quantity < 0){
                item.quantity = 0;
            }
        }

        sales.push([
            item.name,
            cartItem.quantity,
            item.cost * cartItem.quantity,
            item.price * cartItem.quantity
        ]);
    });

    fs.writeFileSync(
        "inventory.json",
        JSON.stringify(inventory,null,2)
    );

    const now = new Date();

    const date =
        `${now.getDate()}-${now.getMonth()+1}-${now.getFullYear()} ` +
        `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

    transactions.push({
        date,
        sales,
        mode: paymentMode
    });

    fs.writeFileSync(
        "transactions.json",
        JSON.stringify(transactions,null,2)
    );

    res.json({
        success:true
    });
});

app.use(express.static(path.join(__dirname, "public")));

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});