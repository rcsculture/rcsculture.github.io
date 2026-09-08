import { 
    closeModal, openConfirmModal, confirm, sendOfficialRequest,
    setConfirmBtnState, setSendBtnState, openModeratorCharterModal
} from "../global/modal.js?v=ab12efa7.9d0b8ed";

import {
    showSignup, showLogin, showResetPassword, signup, login, logout,
    sendResetPasswordRequest, updateProfileRole, openRoleRequest, openPendingEvent, openMyEvent, openProfile,
    searchInput, shareEvent, sharePendingEvent, shareProfile
} from "./account.js?v=ab12efa7.9d0b8ed";

async function handleClick(el) {
    switch (el.dataset.action) {
        case "show-signup":
            showSignup();
            break;

        case "show-signin":
            showLogin();
            break;

        case "show-reset-password":
            showResetPassword();
            break;

        case "signup":
            await signup();
            break;

        case "login":
            await login();
            break;

        case "logout":
            await logout();
            break;
        
        case "send-reset-password-request":
            await sendResetPasswordRequest();
            break;

        case "accordion":
            handleAccordion(el, el.dataset.accordionId);
            break;

        case "update-profile-role":
            updateProfileRole();
            break;

        case "open-request-modal":
            openRoleRequest();
            break;

        case "show-pendingevent":
            openPendingEvent(el.dataset.showPendingeventId);
            break;

        case "show-profile":
            openProfile(el.dataset.showProfileId);
            break;

        case "share-profile":
            shareProfile(el.dataset.id);
            break;

        case "show-myevent":
            openMyEvent(el.dataset.showMyeventId);
            break;

        case "share-pending-event":
            sharePendingEvent(el.dataset.id);
            break;

        case "share-event":
            shareEvent(el.dataset.id);
            break;

        case "edit-event":
            window.location.href = `../edit_event#id=${el.dataset.id}`;
            break;

        case "send-official-request":
            await sendOfficialRequest();
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

        case "open-moderator-charter":
            openModeratorCharterModal();
            break;

        default:
            console.warn("unknown 'click' action:", el.dataset.action)
    }
}

async function handleInput(el) {
    switch (el.dataset.inputType) {
        case "data-search":
            searchInput(el);
            break;

        case "confirm-code":
            setConfirmBtnState(el);
            break;

        case "request-details":
            setSendBtnState(el);
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
document.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-allow-action]") && event.target.closest("[data-no-action]")) return;
    const el = event.target.closest("[data-action]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    await handleClick(el);
});

document.addEventListener("keydown", async (event) => {
    if (!event.target.closest("[data-allow-action]") && event.target.closest("[data-no-action]")) return;
    const el = event.target.closest("[data-action]");
    if (!el) return;
    event.preventDefault(); // prevent page scroll on Space
    await handleClick(el);
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
