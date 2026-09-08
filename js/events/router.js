import { 
    closeModal, openConfirmModal, confirm,
    setConfirmBtnState, openAgeHelpModal, openAreaHelpModal, openViewHelpModal
} from "../global/modal.js?v=a99d250f.c252ac8";

import { 
    openEvent, searchInput, 
    selectWhenOption, selectFilterOption, toggleAdditionalFilter, resetFilter,
    switchView, navPrevMonth, navNextMonth, navToday, calendarSelectDay,
    handleSwipe, shareEvent, toggleFilterSwitch, updateAgeFilter, markOverflowingTags
} from "./events.js"

const container = document.getElementById("events");

/* === LOCAL FUNCTIONS === */
async function handleClick(el, e) {
    switch (el.dataset.action) {
        case "select-option":
            selectFilterOption(el);
            break;

        case "filter-toggle":
            toggleAdditionalFilter(el);
            break;

        case "reset-filter":
            resetFilter();
            break;

        case "switch-view":
            switchView(el.dataset.view);
            break;

        case "open-age-help":
            openAgeHelpModal();
            break;

        case "open-area-help":
            openAreaHelpModal();
            break;

        case "open-view-help":
            openViewHelpModal();
            break;

        case "nav-prev-month":
            navPrevMonth();
            break;

        case "nav-next-month":
            navNextMonth();
            break;

        case "nav-today":
            navToday();
            break;

        case "calendar-select-day":
            calendarSelectDay(el.dataset.date);
            break;

        case "show-event":
            openEvent(el.dataset.eventId);
            break;

        case "share-event":
            shareEvent(el.dataset.id);
            break;

        case "edit-event":
            window.location.href = `../edit_event#id=${el.dataset.id}`;
            break;

        case "open-confirm-modal":
            openConfirmModal(el.dataset.type, el.dataset.actionType);
            break;

        case "confirm":
            await confirm(el.dataset.actionType);
            break;

        case "close-modal":
            closeModal(el);
            break;

        default:
            console.warn("unknown 'click' action:", el.dataset.action)
    }
}

async function handleInput(el) {
    switch (el.dataset.inputType) {
        case "event-search":
            searchInput(el);
            break;

        case "confirm-code":
            setConfirmBtnState(el);
            break;

        case "filter-switch":
            toggleFilterSwitch(el);
            break;

        case "filter-age":
            updateAgeFilter(el);
            break;

        default:
            console.warn("unknown 'input' type:", el.dataset.inputType)
    }
}

async function handleChange(el) {
    switch (el.dataset.changeType) {
        case "confirm-reason":
            setConfirmBtnState(el);
            break;

        default:
            console.warn("unknown 'change' action:", el.dataset.changeType)
    }
}

/* === LISTENERS === */
window.addEventListener("resize", () => requestAnimationFrame(markOverflowingTags));

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

document.addEventListener("input", (event) => {
    const el = event.target.closest("[data-input-type]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    handleInput(el);
});

document.addEventListener("change", (event) => {
    const el = event.target.closest("[data-change-type]");
    if (!el) return;
    handleChange(el);
});

document.addEventListener("submit", (event) => {
    event.preventDefault();
});

window.addEventListener("load", () => {
    document.documentElement.classList.add("ready");
});

