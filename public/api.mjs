export async function requestJson(url, options = {}) {
    let response;
    try {
        response = await fetch(url, { cache: "no-store", ...options });
    } catch {
        throw new Error("Unable to reach the server. Please try again.");
    }
    const result = await response.json().catch(() => null);
    if (!response.ok || result === null) {
        const message = result?.message || "Unable to complete the request. Please try again.";
        throw Object.assign(new Error(message), { status: response.status });
    }
    return result;
}

export function escapeHtml(value) {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return String(value).replace(/[&<>"']/g, character => entities[character]);
}
