console.log("executing:", "modal.js");

const successModal = document.getElementById("success-modal");
const errorModal = document.getElementById("error-modal");
const ageHelpModal = document.getElementById("age-help-modal");
const tagHelpModal = document.getElementById("tag-help-modal");
const endDateHelpModal = document.getElementById("end-date-help-modal");
const categoryHelpModal = document.getElementById("category-help-modal");
const areaHelpModal = document.getElementById("area-help-modal");
const viewHelpModal = document.getElementById("view-help-modal");
const contributorCharterModal = document.getElementById("contributor-charter-modal");
const moderatorCharterModal = document.getElementById("moderator-charter-modal");

const eventModal = document.getElementById("event-modal");
const eventModalContent = document.getElementById("event-modal-content");

const profileModal = document.getElementById("profile-modal");
const profileModalContent = document.getElementById("profile-modal-content");

const updateRoleModal = document.getElementById("update-role-modal");

const confirmModal = document.getElementById("confirm-modal");
const confirmTitle = document.getElementById("confirm-title");
const confirmCodeEl = document.getElementById("confirm-code");
const confirmInput = document.getElementById("confirm-input");
const confirmBtn = document.getElementById("confirm-btn");
const confirmBtnIcon = document.getElementById("confirm-btn-icon");
const confirmReasons = document.getElementById("confirm-reasons");
const confirmReasonsList = document.getElementById("confirm-reasons-list");
const confirmReasonText = document.getElementById("confirm-reason-text");

const officialRequestModal = document.getElementById("official-request-modal");
const officialRequestInput = document.getElementById("details-input");
const officialRequestCharCount = document.getElementById("request-char-count");
const officialRequestSendBtn = document.getElementById("modal-official-request-btn");

let generatedCode = null;
let currentEvent = null;
let currentProfile = null;
let currentModal = null;
let sessionProfile = null;
let eventModalType = null;
let reasonRequired = false;

// Predefined moderation motives shown as checkboxes in the confirm modal.
const MODERATION_REASONS = {
    event: [
        "Contenu inapproprié",
        "Doublon",
        "Informations incorrectes ou incomplètes",
        "Hors thématique / non culturel",
        "Spam ou publicité",
        "Autre",
    ],
    request: [
        "Demande non justifiée",
        "Informations insuffisantes",
        "Activité non éligible",
        "Autre",
    ],
};

/* === LOCAL FUNCTIONS === */
function closeSuccessModal() {
    successModal.classList.add("hidden");
    document.body.style.overflow = "";
}

function closeErrorModal() {
    errorModal.classList.add("hidden");
    document.body.style.overflow = "";
}

function closeCurrentModal() {
    if (currentModal) {
        currentModal.classList.add("hidden");
        document.body.style.overflow = "";
        currentModal = null;
        currentProfile = null;
        currentEvent = null;
    }
}

function closeConfirmModal() {
    generatedCode = null;
    confirmModal.classList.add("hidden");
}

function buildConfirmReasons(kind) {
    confirmReasonsList.innerHTML = "";
    (MODERATION_REASONS[kind] || []).forEach((label, i) => {
        const option = document.createElement("label");
        option.className = "confirm-reason-option";
        option.innerHTML = `<input type="checkbox" value="${label}" id="confirm-reason-${i}" data-change-type="confirm-reason"><span>${label}</span>`;
        confirmReasonsList.appendChild(option);
    });
    confirmReasonText.value = "";
}

function getSelectedReasons() {
    return Array.from(confirmReasonsList.querySelectorAll("input[type=checkbox]:checked")).map((c) => c.value);
}

function collectModerationReason() {
    if (!reasonRequired) return null;
    return {
        reasons: getSelectedReasons(),
        note: confirmReasonText.value.trim(),
    };
}

function updateConfirmBtnState() {
    const codeOk = confirmInput.value === generatedCode;
    const reasonsOk = !reasonRequired || getSelectedReasons().length > 0;
    confirmBtn.disabled = !(codeOk && reasonsOk);
}

function formatReason(reason) {
    if (!reason) return "";
    const lines = [];
    if (reason.reasons && reason.reasons.length) {
        lines.push(`Motif(s) : ${reason.reasons.join(", ")}`);
    }
    if (reason.note) {
        lines.push(`Précision complémentaire : ${reason.note}`);
    }
    return lines.length ? `${lines.join("\n")}\n\n` : "";
}

// Delivery goes through the "send-email" Supabase Edge Function (Resend). The `from`
// stays on the verified domain; `replyTo` is the acting moderator so replies reach them.
async function sendEmail({ to, subject, body, replyTo = null }) {
    if (!to) {
        console.warn("sendEmail skipped: no recipient");
        return null;
    }
    console.log("sending email:", { to, subject, replyTo });
    const { error } = await window.supabaseClient.functions.invoke("send-email", {
        body: { to, subject, body, from: `${APP_CONFIG.EMAIL_NAME} <${APP_CONFIG.EMAIL_ADDRESS}>`, replyTo },
    });
    if (error) console.error("send-email failed:", error);
    return error;
}

async function deleteEvent(event, reason = null) {
    console.log("deleting event:", event.id, reason);
    const { data, error } = await window.supabaseClient
        .from("events")
        .delete()
        .eq("id", event.id);
    if (error) return error;

    const subject = `Votre évènement « ${event.title} » a été retiré`;
    const body =
`Bonjour ${event.creator_name || ""},

Votre évènement « ${event.title} » a été retiré par l'équipe de modération.

Détails de l'évènement :
- Titre : ${event.title}
- Date : ${formatDateForUI(event.event_date)}
- Lieu : ${event.location_name || "—"}

${formatReason(reason)}Si vous n'êtes pas d'accord avec cette décision, vous pouvez répondre à cet email pour nous en faire part.

L'équipe Planet Raves`;

    // Surface a failed notification to the caller so it shows the error modal.
    return await sendEmail({ to: event.creator_email ?? null, subject, body, replyTo: sessionProfile?.email ?? null });
}

async function acceptEvent(event) {
    console.log("accepting event:", event.id);
    const { error } = await window.supabaseClient
        .from("events")
        .update({
            pending: false
        })
        .eq("id", event.id);
    if (error) return error;

    const event_url = `${SITE_URL}#id=${event.id}&type=myevent`;
    const subject = `Votre évènement « ${event.title} » a été publié`;
    const body =
`Bonjour ${event.creator_name || ""},

Bonne nouvelle ! Votre évènement est désormais visible en ligne.

Détails de l'évènement :
- Titre : ${event.title}
- Date : ${formatDateForUI(event.event_date)}
- Lieu : ${event.location_name || "—"}
- Lien : ${event_url}

Pour toute question, vous pouvez répondre à cet email.

L'équipe Planet Raves`;

    // return await sendEmail({ to: event.creator_email ?? null, subject, body, replyTo: sessionProfile?.email ?? null });
}

async function rejectEvent(event, reason = null) {
    console.log("rejecting event:", event.id, reason);
    return await deleteEvent(event, reason);  // if event rejected, it is deleted
}

async function acceptProfile(profile) {
    console.log("accepting official request from user:", profile.id);
    const { error } = await window.supabaseClient
        .from("profiles")
        .update({
            role: 1,
            official_request: false
        })
        .eq("id", profile.id);
    if (error) return error;

    const subject = `Votre demande de statut officiel a été acceptée`;
    const body =
`Bonjour ${profile.name || ""},

Votre demande de statut de contributeur officiel a été acceptée. Vous pouvez désormais publier des évènements sans délai.

Pour toute question, vous pouvez répondre à cet email.

L'équipe Planet Raves`;

    // return await sendEmail({ to: profile.email ?? null, subject, body, replyTo: sessionProfile?.email ?? null });
}

async function rejectProfile(profile, reason = null) {
    console.log("rejecting official request from user:", profile.id, reason);
    const { error } = await window.supabaseClient
        .from("profiles")
        .update({
            official_request: false
        })
        .eq("id", profile.id);
    if (error) return error;

    const subject = `Votre demande de statut officiel a été refusée`;
    const body =
`Bonjour ${profile.name || ""},

Votre demande de statut de contributeur officiel n'a pas été retenue par l'équipe de modération.

${formatReason(reason)}Si vous n'êtes pas d'accord avec cette décision, vous pouvez répondre à cet email pour nous en faire part.

L'équipe Planet Raves`;

    return await sendEmail({ to: profile.email ?? null, subject, body, replyTo: sessionProfile?.email ?? null });
}

/* === EXPORTED FUNCTIONS === */
export function openSuccessModal(text) {
    successModal.querySelector("#text").innerText = text;
    successModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openErrorModal(text, message=null) {
    errorModal.querySelector("#text").innerText = text;
    if (message !== null) {
        errorModal.querySelector("#message").innerText = message;
    }
    errorModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openAgeHelpModal() {
    ageHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openTagHelpModal() {
    tagHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openEndDateHelpModal() {
    endDateHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openCategoryHelpModal() {
    categoryHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openAreaHelpModal() {
    areaHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openViewHelpModal() {
    viewHelpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openContributorCharterModal() {
    contributorCharterModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openModeratorCharterModal() {
    moderatorCharterModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openProfileModal(profile, user_profile = null) {
    currentProfile = profile;
    currentModal = profileModal;
    sessionProfile = user_profile;  // acting moderator, used as reply-to when accepting/rejecting

    profileModalContent.innerHTML = `
        <div class="account-section-title">
            <span class="material-symbols-outlined" aria-hidden="true">person</span>
            <span id="account-name">${profile.name}</span>
        </div>

        <div class="account-details">
            <div class="detail-section">
                <div class="detail-row">
                    <span class="label">Email</span>
                    <span id="account-email" class="value detail-user">${profile.email}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Status</span>
                    <span id="account-status" class="value detail-user">${APP_CONFIG.USER_STATUS[profile.status]["label"]}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Contributeur</span>
                    <span id="account-role" class="value detail-user">${APP_CONFIG.ROLES[profile.role]}</span>
                </div>
            </div>
        </div>

        <div class="account-section-title">
            <span class="material-symbols-outlined" aria-hidden="true">format_quote</span>
            <span>Description de la demande</span>
        </div>
        <blockquote class="user-quote">${linkify(profile.official_request_details)}</blockquote>
    `;

    profileModal.querySelector("#modal-share-btn").dataset.id = currentProfile.id;
    profileModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openUpdateRoleModal() {
    currentModal = updateRoleModal;
    updateRoleModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openEventModal(event, type, user_profile=null) {
    currentEvent = event;
    currentModal = eventModal;
    sessionProfile = user_profile;
    eventModalType = type;

    const eventData = renderEventData(event, true);

    
    eventModal.querySelector("#modal-share-btn").classList.remove("hidden");
    eventModal.querySelector("#modal-share-btn").dataset.action = "share-event";
    eventModal.querySelector("#modal-share-btn").disabled = false;
    eventModal.querySelector("#modal-share-btn").dataset.id = currentEvent.id;

    eventModal.querySelector("#modal-edit-event-btn").dataset.id = currentEvent.id;

    switch (type) {
        case "my-event":
            eventModal.querySelector("#modal-edit-event-btn").classList.remove("hidden");
            eventModal.querySelector("#modal-delete-event-btn").classList.remove("hidden");
            eventModal.querySelector("#modal-accept-event-btn").classList.add("hidden");
            eventModal.querySelector("#modal-reject-event-btn").classList.add("hidden");

            if (event.pending) eventModal.querySelector("#modal-share-btn").classList.add("hidden");
            break;

        case "pending-event":
            eventModal.querySelector("#modal-share-btn").dataset.action = "share-pending-event";
            eventModal.querySelector("#modal-edit-event-btn").classList.add("hidden");
            eventModal.querySelector("#modal-delete-event-btn").classList.add("hidden");
            eventModal.querySelector("#modal-accept-event-btn").classList.remove("hidden");
            eventModal.querySelector("#modal-reject-event-btn").classList.remove("hidden");
            break;

        default:  // classic event
            if (user_profile && user_profile.id && ( (user_profile.id === eventData.created_by) || (user_profile.role >= 2)))
            {
                eventModal.querySelector("#modal-edit-event-btn").classList.remove("hidden");
                eventModal.querySelector("#modal-delete-event-btn").classList.remove("hidden");
            }
            else
            {
                eventModal.querySelector("#modal-edit-event-btn").classList.add("hidden");
                eventModal.querySelector("#modal-delete-event-btn").classList.add("hidden");
            }
            eventModal.querySelector("#modal-accept-event-btn").classList.add("hidden");
            eventModal.querySelector("#modal-reject-event-btn").classList.add("hidden");
    }

    eventModalContent.innerHTML = `
        <header class="event-modal-header" style="--event-color: ${eventData.categoryColor};">
            <div class="event-side" style="background: ${eventData.categoryPie}">
                <div class="event-category">${eventData.categoryLabel}</div>
                <div class="event-date">${formatEventDate(eventData.event_date)}</div>
                ${eventData.timeHtml}
            </div>
            <span id="modal-title" class="event-modal-title">${event.title}</span>
        </header>
        ${eventData.imageHtml}
        ${eventData.categoriesHtml}

        <div class="event-details">
            <div class="event-meta">
                <span class="event-icon-text">
                <span class="material-symbols-outlined">place</span>
                <span class="text"><strong>${eventData.location_name}</strong></span>
            </span>
            </div>
            <div class="event-meta">
                ${renderMaterialIconText("sell", eventData.priceLabel)}
            </div>
            <div class="event-meta">
                ${renderMaterialIconText("face", eventData.ageLabel)}
            </div>
            <div class="event-meta">
                ${eventData.locationAddressHtml}
            </div>
            ${eventData.eatHtml}
            ${eventData.siteUrlHtml}
            ${eventData.phoneHtml}
            ${eventData.emailHtml}
            ${eventData.pendingHtml}
            ${eventData.creatorHtml}
            ${eventData.tagsHtml}
            ${eventData.descriptionHtml}
        </div>
    `;

    console.log("event modal data:", eventData);

    if (eventData.image_url) {
        setEventImage(eventModalContent, event.image_url);
    }

    document.body.style.overflow = "hidden";
    eventModal.classList.remove("hidden");
    eventModal.scrollTop = 0;
}

export function openRoleRequestModal(profile) {
    currentProfile = profile;
    currentModal = officialRequestModal;
    officialRequestInput.value = "";
    officialRequestSendBtn.disabled = true;
    officialRequestSendBtn.setAttribute("aria-busy", "false");

    officialRequestModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
}

export function openConfirmModal(type, action_type) {
    generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
    confirmCodeEl.textContent = generatedCode;

    confirmInput.value = "";
    confirmBtn.disabled = true;

    reasonRequired = false;
    let reasonKind = null;

    switch (action_type) {
        case "delete":
            // confirmTitle.innerHTML = "Pour <strong>supprimer l'évènement</strong>, tapez le code suivant :";
            confirmBtn.innerText = "Supprimer";
            confirmBtnIcon.innerText = "delete";
            confirmBtn.classList.add("delete");
            confirmBtn.classList.remove("info");
            confirmBtn.dataset.actionType = "delete-event";
            // a moderator deleting an event that isn't theirs must justify it
            {
                const isOwnEvent = eventModalType === "my-event"
                    || (sessionProfile && currentEvent && currentEvent.created_by === sessionProfile.id);
                if (!isOwnEvent) {
                    reasonRequired = true;
                    reasonKind = "event";
                }
            }
            break;

        case "accept":
            // confirmTitle.classList.remove("hidden");
            if (type == "event") {
                // confirmTitle.innerHTML = "Pour <strong>accepter la publication</strong>, tapez le code suivant :";
                confirmBtn.dataset.actionType = "accept-event";
            } else {
                // confirmTitle.innerHTML = "Pour <strong>accepter la requête</strong>, tapez le code suivant :";
                confirmBtn.dataset.actionType = "accept-official-request";
            }
            confirmBtn.innerText = "Accepter";
            confirmBtn.classList.remove("delete");
            confirmBtn.classList.add("info");
            confirmBtnIcon.innerText = "check";
            break;

        case "reject":
            // confirmTitle.classList.add("hidden");
            if (type == "event") {
                confirmBtn.dataset.actionType = "reject-event";
                reasonKind = "event";
            } else {
                confirmBtn.dataset.actionType = "reject-official-request";
                reasonKind = "request";
            }
            reasonRequired = true;
            confirmBtn.innerText = "Rejeter";
            confirmBtn.classList.add("delete");
            confirmBtn.classList.remove("info");
            confirmBtnIcon.innerText = "close";
            break;

        default:
            // confirmTitle.innerHTML = "";
            confirmBtn.innerText = "";
            confirmBtnIcon.innerText = "";
            confirmBtn.classList.remove("delete");
            confirmBtn.classList.remove("info");
            confirmBtn.dataset.action = "";
            return;
            
    }

    if (reasonRequired) {
        buildConfirmReasons(reasonKind);
        confirmReasons.classList.remove("hidden");
    } else {
        confirmReasonsList.innerHTML = "";
        confirmReasonText.value = "";
        confirmReasons.classList.add("hidden");
    }

    confirmModal.classList.remove("hidden");
}

export async function confirm(action) {
    var successMsg = "";
    var error = null;
    const reason = collectModerationReason();
    switch (action) {
        
        case "delete-event":
            if (!currentEvent) return;
            error = await deleteEvent(currentEvent, reason);
            successMsg = "Évènement supprimé ! La page va se rafraichir automatiquement."
            break;

        case "accept-event":
            if (!currentEvent) return;
            error = await acceptEvent(currentEvent);
            successMsg = "Évènement accepté ! La page va se rafraichir automatiquement."
            break;

        case "reject-event":
            if (!currentEvent) return;
            error = await rejectEvent(currentEvent, reason);
            successMsg = "Évènement rejeté ! La page va se rafraichir automatiquement."
            break;

        case "accept-official-request":
            if (!currentProfile) return;
            error = await acceptProfile(currentProfile);
            successMsg = "Requête acceptée ! La page va se rafraichir automatiquement."
            break;

        case "reject-official-request":
            if (!currentProfile) return;
            error = await rejectProfile(currentProfile, reason);
            successMsg = "Requête rejetée ! La page va se rafraichir automatiquement."
            break;

        default:
            console.warn("Unknown action:", action);
            return;
    }

    if (error) {
        openErrorModal(localizeAuthError(error, as_is=true));
        console.error(error);
        return;
    }

    openSuccessModal(successMsg);
    closeConfirmModal();
    closeCurrentModal();
    
    // setTimeout(function () {
    //     window.location.reload();
    // }, 3000);
}

export function closeModal(target) {
    const modal = target.closest(".modal-overlay");
    if (!modal) return;
    switch (modal.id) {
        case "success-modal":
            closeSuccessModal();
            break;

        case "error-modal":
            closeErrorModal();
            break;

        case "confirm-modal":
            closeConfirmModal();
            break;

        case "event-modal":
        case "profile-modal":
        case "official-request-modal":
            closeCurrentModal();
            break;

        default:
            modal.classList.add("hidden");
            document.body.style.overflow = "";
            break;
    }
}

export async function sendOfficialRequest() {
    if (!currentProfile) return;

    // SUPABASE UPDATE PROFILES
    console.log("Official role request for user", currentProfile);
    const { error } = await window.supabaseClient
        .from("profiles")
        .update({
            official_request: true,
            official_request_details: officialRequestInput.value
        })
        .eq("id", currentProfile.id); // auth.uid()

    if (error) {
        openErrorModal("Un problème est survenu");
        console.error(error);
        return;
    }

    openSuccessModal("Requête envoyée !");
    closeCurrentModal();
}

export function setConfirmBtnState(target) {
    updateConfirmBtnState();
}

export function setSendBtnState(target) {
    officialRequestSendBtn.disabled = target.value.length < 100;
    officialRequestCharCount.innerText = target.value.length;
}

