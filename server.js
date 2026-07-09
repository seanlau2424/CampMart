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

app.use(express.static(path.join(__dirname, "public")));

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

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});