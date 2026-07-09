const form = document.getElementById("loginForm");

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const response = await fetch("/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username,
            password
        })
    });

    const result = await response.json();
    console.log(result)

    if (result.success) {
        window.location.href = "/admin";
    } else {
        alert(result.message);
    }
});