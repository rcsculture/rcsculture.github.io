import {
    resetPassword
} from "./account_reset_pwd.js?v=a47ba082.956c656";

import {closeModal} from "../global/modal.js?v=a47ba082.956c656";

async function handleClick(el) {
    switch (el.dataset.action) {
        case "reset-password":
            await resetPassword();
            break;

        case "close-modal":
            closeModal(el);
            break;

        default:
            console.warn("unknown 'click' action:", el.dataset.action)
    }
}

/* === LISTENERS === */
document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-allow-action]") && event.target.closest("[data-no-action]")) return;
    const el = event.target.closest("[data-action]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    await handleClick(el);
});

window.addEventListener("load", () => {
    document.documentElement.classList.add("ready");
});

