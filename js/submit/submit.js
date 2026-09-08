console.log("executing:", "submit.js");

import { openErrorModal, openSuccessModal } from "../global/modal.js?v=d3d3279a.7b8008b";
import { initEventForm, getEventFormPayload, uploadImageFile } from "../global/eventform.js?v=d3d3279a.7b8008b";

/* === VARIABLES === */
const loading = document.getElementById("loading-screen");
// keep the spinner outside the .ready-gated content so it stays visible while loading
document.body.appendChild(loading);
const form = document.getElementById("event-form");
const accountDetail = document.getElementById("account-detail");
const accountRole = document.getElementById("account-role");
const permissionDetails = document.getElementById("detail-permission");
const submitContainer = document.getElementById("submit-container");

let user_profile = null;

/* === LOCAL FUNCTIONS === */
async function initSubmitPage() {
    console.log("init /submit/ page");
    const session = await getSessionUserProfile();
    if (session?.session?.user && session?.profile) {
        showSubmit(session.session.user, session.profile);
    } else {
        showLoginWarning();
    }
}

function showLoginWarning() {
    user_profile = null;
    accountDetail.hidden = true;
    submitContainer.hidden = true;
    window.location.href = `../account/`
}

function showSubmit(user, profile) {
    user_profile = profile;
    
    /* configure roles */
    accountRole.innerText = APP_CONFIG.ROLES[user_profile.role];
    permissionDetails.innerHTML = renderAccountPermissionDetails();
    const permissionOfficial = permissionDetails.querySelector("#permission-official");
    const permissionAdmin = permissionDetails.querySelector("#permission-admin");

    switch(user_profile.role) {
        case 0: /* non official */
            permissionOfficial.classList.add("denied");
            permissionOfficial.classList.remove("granted");
            permissionOfficial.querySelector("#icon").innerText = "lock"
            permissionAdmin.hidden = true;
            break;
        
        case 1: /* official */
            permissionOfficial.classList.remove("denied");
            permissionOfficial.classList.add("granted");
            permissionOfficial.querySelector("#icon").innerText = "check"
            permissionAdmin.hidden = true;
            break;

        case 2:
        case 3: /* moderateur/admin */
            permissionOfficial.classList.remove("denied");
            permissionOfficial.classList.add("granted");
            permissionOfficial.querySelector("#icon").innerText = "check"
            permissionAdmin.hidden = false;
            break;
        
        default:
            permissionOfficial.classList.add("denied");
            permissionOfficial.classList.remove("granted");
            permissionOfficial.querySelector("#icon").innerText = "lock"
            permissionAdmin.hidden = true;
    }

    /* initialize form */
    initEventForm();
    form.querySelector("#end_date_container").hidden = false;
    form.querySelector("#cancel-btn").hidden = true;
    form.querySelector("#cancel-btn").disabled = true;

    /* show page */
    accountDetail.hidden = false;
    submitContainer.hidden = false;
    loading.style.display = "none";
    document.documentElement.classList.add("ready");
}

/* === EXPORTED FUNCTIONS === */
export async function submitEvent() {
    button.setAttribute("aria-busy", "true");

    /* get form payload */
    const new_event = getEventFormPayload();
    if (!new_event) {
        button.setAttribute("aria-busy", "false");
        return;
    };

    /* upload image if needed */
    const {imageUrl, error} = await uploadImageFile();
    if (error) {
        button.setAttribute("aria-busy", "false");
        openErrorModal("Problème pendant le téléchargement de l'image");
        console.error(error);
        return;
    }

    /* push events on database */
    for (let day = 0; day < new_event.nb_days; day++) {
        var payload = new_event.payload;
        payload.event_date = addDays(form.querySelector("#event_date").value, day).toLocaleDateString("fr-CA")
        payload.pending = user_profile.role == 0
        payload.created_by = user_profile?.id ?? null
        payload.creator_name = user_profile?.name ?? null;
        payload.image_url = imageUrl
        payload.is_test = APP_CONFIG.DEV
        console.log("submit event payload:", payload)

        const { data: event, error } = await window.supabaseClient.from("events").insert(payload);
        if (error) {
            button.setAttribute("aria-busy", "false");
            if ((new_event.nb_days > 1) && (day > 0)) {
                openErrorModal(`Problème de publication (jour ${day+1})\nCependant les premiers jours de l'évènement ont sans doute été publiés`, error.message ? error.message : null);
            } else {
                openErrorModal("Problème de publication", error.message ? error.message : null);
            }
            console.error(error);
            return;
        }
    }

    button.setAttribute("aria-busy", "false");
    window.scrollTo(0, 0);
    form.reset();
    openSuccessModal("Évènement publié ! Retour à la liste des évènements automatiquement.")

    setTimeout(function () {
        window.location.href = "..";
    }, 3000);
    
}

/* === INITIAL LOAD === */
initSubmitPage().catch(console.error);

