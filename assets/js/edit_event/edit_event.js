console.log("executing:", "edit_event.js");

import { openErrorModal, openSuccessModal } from "../global/modal.js?v=a47ba082.956c656";
import { initEventForm, getEventFormPayload, uploadImageFile } from "../global/eventform.js?v=a47ba082.956c656";

/* === VARIABLES === */
const hash = window.location.hash.substring(1);
const previousPage = document.referrer;
const params = new URLSearchParams(hash);
const eventId = params.get("id");

const notice = document.getElementById("notice-tile");
const noticeTitle = notice.querySelector("#title");
const noticeText = notice.querySelector("#text");

const loading = document.getElementById("loading-screen");
const backBtn = document.getElementById("back-btn");
const form = document.getElementById("event-form");
const accountDetail = document.getElementById("account-detail");
const submitContainer = document.getElementById("submit-container");

let user_profile = null;

/* === LOCAL FUNCTIONS === */
async function initEditEventPage() {
    console.log("init /edit_event/ page");
    console.log("eventId:", eventId);

    submitContainer.hidden = true;
    const session = await getSessionUserProfile();
    if (session?.session?.user && session?.profile) {
        // get event
         const { data, error } = await window.supabaseClient
            .from("future_events")
            .select("*")
            .eq("id", eventId).single()

        if (error) {
            console.log("Error:", error);
            openErrorModal("ERREUR survenue durant le chargement de l'évènement");
            return;
        }
        showEdit(session.session.user, session.profile, data);
    } else {
        showLoginWarning();
    }
}

function showLoginWarning() {
    user_profile = null;
    submitContainer.hidden = true;
    accountDetail.hidden = true;
    window.location.href = `../account/`;
}

function showEdit(user, profile, event) {
    user_profile = profile;
    
    /* initialize form */
    initEventForm(event);
    form.querySelector("#end_date_container").hidden = true;
    form.querySelector("#cancel-btn").hidden = false;
    form.querySelector("#cancel-btn").disabled = false;

    /* show page */
    noticeTitle.innerText = "Editer votre évènement";
    noticeText.innerHTML = `Vous souhaitez ici éditer un évènement que vous avez créé le ${formatDateForUI(event.created_at)}`;
    accountDetail.hidden = true;
    submitContainer.hidden = false;
    backBtn.classList.remove("hidden");
    loading.style.display = "none";
}

/* === EXPORTED FUNCTIONS === */
export function goBack(){
    window.location.href = `${previousPage}#id=${eventId}&type=myevent`;
}

export async function editEvent() {
    button.setAttribute("aria-busy", "true");

    /* get form payload */
    const new_event = getEventFormPayload();
    if (!new_event) {
        button.setAttribute("aria-busy", "false");
        return;
    };

    /* upload image if needed */
    const {imageUrl, error: uploadError} = await uploadImageFile();
    if (uploadError) {
        button.setAttribute("aria-busy", "false");
        openErrorModal("Problème pendant le téléchargement de l'image");
        console.error(uploadError);
        return;
    }

    var payload = new_event.payload;
    payload.event_date = form.querySelector("#event_date").value;
    payload.pending = user_profile.role == 0;
    // payload.created_by = user_profile?.id ?? null;
    // payload.creator_name = user_profile?.name ?? null;
    payload.image_url = imageUrl;
    console.log("submit event payload (for edit):", payload);

    const { error } = await window.supabaseClient
        .from("events")
        .update(payload)
        .eq("id", eventId);

    if (error) {
        button.setAttribute("aria-busy", "false");
        openErrorModal("Problème de mise à jour");
        console.error(error);
        return;
    }

    button.setAttribute("aria-busy", "false");
    window.scrollTo(0, 0);
    form.reset();
    openSuccessModal("Évènement mis à jour ! Retour à la liste des évènements automatiquement.");

    setTimeout(function () {
        window.location.href = "..";
    }, 3000);
}

/* === INITIAL LOAD === */
initEditEventPage().catch(console.error);