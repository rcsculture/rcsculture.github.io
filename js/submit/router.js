import { 
    closeModal, openConfirmModal, confirm,
    setConfirmBtnState, openAgeHelpModal, openTagHelpModal, openEndDateHelpModal, openCategoryHelpModal, 
    openContributorCharterModal
} from "../global/modal.js?v=a99d250f.c252ac8";

import { 
    priceChanged, handleImageChoice, formatPhoneInput, toggleCategory
} from "../global/eventform.js?v=a99d250f.c252ac8"

import { 
    addTag, removeLastTag
} from "../global/tags.js"

import { 
    searchAddress, selectAddress, hideAddressSuggestions
} from "../global/address.js?v=a99d250f.c252ac8"

import { 
    submitEvent
} from "./submit.js"


/* === LOCAL FUNCTIONS === */
async function handleClick(el, e) {
    switch (el.dataset.action) {
        case "tag-input":
            if (event.key === "Enter" || event.key === ",") {
                event.preventDefault(); // prevent page scroll on Space
                addTag();
            } 
            if (e.key === "Backspace") {
                removeLastTag();
            }
            break;

        case "pick-file":
            document.getElementById("event-image").click()  // wrapper to input type="file"
            break;

        case "toggle-category":
            toggleCategory(el);
            break;

        case "select-address":
            selectAddress(el);
            break;

        case "submit-event":
            await submitEvent();
            break;

        case "close-modal":
            closeModal(el);
            break;

        case "open-age-help":
            openAgeHelpModal();
            break;

        case "open-tag-help":
            openTagHelpModal();
            break;

        case "open-end-date-help":
            openEndDateHelpModal();
            break;

        case "open-category-help":
            openCategoryHelpModal();
            break;

        case "open-contributor-charter":
            openContributorCharterModal();
            break;

        default:
            console.warn("unknown 'click' action:", el.dataset.action)
    }
}

async function handleInput(el) {
    switch (el.dataset.inputType) {
        case "phone":
            formatPhoneInput(el);
            break;

        case "address-search":
            searchAddress(el);
            break;

        default:
            console.warn("unknown 'input' type:", el.dataset.inputType)
    }
}

async function handleChange(el) {
    switch (el.dataset.changeType) {
        case "price-choice":
            priceChanged(el);
            break;

        case "image-choice":
            const file = el.files[0];
            if (!file) return;
            await handleImageChoice(file);
            break;

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
    if (el.dataset.action == "phone-input") {
        if (
            !/[0-9+]/.test(event.key) &&
            event.key.length === 1
        ) {
            event.preventDefault();
        }
        return;
    } else 
        if (el.dataset.action != "tag-input") {
        event.preventDefault();
    }
    await handleClick(el, event);
});

document.addEventListener("input", (event) => {
    const el = event.target.closest("[data-input-type]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    handleInput(el);
});

document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-change-type]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    handleChange(el);
});

document.addEventListener("focusout", (event) => {
    if (!event.target.closest('[data-input-type="address-search"]')) return;
    setTimeout(hideAddressSuggestions, 150); // let a suggestion click register first
});


document.addEventListener("submit", (event) => {
  event.preventDefault();
});
