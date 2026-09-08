import { 
    closeModal, openConfirmModal, confirm,
    setConfirmBtnState
} from "../global/modal.js?v=ab12efa7.9d0b8ed";

import { 

} from "./contacts.js?v=ab12efa7.9d0b8ed";

/* === LOCAL FUNCTIONS === */
async function handleClick(el, e) {
    switch (el.dataset.action) {
        default:
            console.warn("unknown 'click' action:", el.dataset.action)
    }
}

async function handleChange(el) {
    switch (el.dataset.changeType) {
        default:
            console.warn("unknown 'change' action:", el.dataset.changeType)
    }
}

/* === LISTENERS === */
document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-allow-action]") && event.target.closest("[data-no-action]")) return;
    const el = event.target.closest("[data-action]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    await handleClick(el, event);
});

document.addEventListener("keydown", async (event) => {
    if (!event.target.closest("[data-allow-action]") && event.target.closest("[data-no-action]")) return;
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (el.dataset.action != "tag-input") {
        event.preventDefault();
    }
    await handleClick(el, event);
});

document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-change-type]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    handleChange(el);
});


document.addEventListener("submit", (event) => {
  event.preventDefault();
});
