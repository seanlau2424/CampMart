const form = document.getElementById("loginForm");
const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitButton.disabled) return;
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    submitButton.disabled = true;
    try {
        const { requestJson } = await import("./api.mjs");
        const result = await requestJson("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });
        if (result.success) window.location.href = "/admin";
        else alert(result.message);
    } catch (error) {
        alert(error.message);
    } finally {
        submitButton.disabled = false;
    }
});
