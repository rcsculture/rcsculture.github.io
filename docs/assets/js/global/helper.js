console.log("executing:", "helper.js");

/* === ERRORS/MESSAGES === */
function localizeAuthError(error, as_is = false) {
  // error is typically an object with { name, message, code, status, ... }
  const code = error?.code || error?.name;

  const dict = {
    // common examples (codes vary by case/provider)
    "invalid_credentials": "Email ou mot de passe incorrect.",
    "invalid_grant": "Connexion impossible. Veuillez réessayer.",
    "user_already_exists": "Un compte existe déjà avec cet email.",
    "weak_password": "Mot de passe trop faible. Utilisez au moins 8 caractères.",
    "email_not_confirmed": "Veuillez confirmer votre email avant de vous connecter.",
    "same_password": "Le nouveau mot de passe doit être différent de l'ancien.",
    "invalid_password": "Mot de passe incorrect.",
    "invalid_email": "Email invalide.",
  };
  console.log("ERROR:", code)

  if (dict[code]) return dict[code];
  // as_is surfaces the raw provider message instead of the generic fallback
  if (as_is && error?.message) return error.message;
  return "Une erreur est survenue. Veuillez réessayer.";
}

/* === DATE & TIME === */
function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function formatDateForUI(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString("fr-FR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
}

function formatTimeForUI(timeString) {
    return timeString.slice(0, 5);  // "18:30:45" => "18:30"
}

function formatEventDate(dateStr) {
    const date = new Date(dateStr);
    var formattedDate = date.toLocaleDateString("fr-FR", {
        weekday: "short",
        day: "numeric",
        month: "short"
    });

    // Capitalize first letter (Vendredi…)
    return `<strong>${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}</strong>`;
}

function formatEventTime(timeStr) {
    // assume "18:30:45" => "18:30"
    const [hour, min] = timeStr.slice(0, 5).split(":");
    if (min == "00") {
        return `${hour}h`;
    } else {
        return `${hour}h${min}`;
    }
}

function formatEventDateTime(dateStr, timeStr) {
    var formattedDate = formatEventDate(dateStr);
    if (timeStr) {
        formattedDate += ` - ${formatEventTime(timeStr)}`
    }
    return formattedDate;
}

function startOfDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getSunday(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 (Sun) → 6 (Sat)
    const diff = (7 - day) % 7;
    d.setDate(d.getDate() + diff);
    return startOfDay(d);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return startOfDay(d);
}

function sortByDate(events) {
    return events.sort(
        (a, b) =>
            new Date(a.event_date) - new Date(b.event_date)
    );
}

function formatDateRange(startDate, endDate) {
    if (startDate.toLocaleDateString() == endDate.toLocaleDateString()) {
        /* this week sunday == tomorrow */
        return `Demain ${formatEventDate(startDate)}`;
    } else {
        return `Du ${formatEventDate(startDate)} au ${formatEventDate(endDate)}`;
    }
}


/* === HTML RENDERING === */
function renderMaterialIconText(icon, text) {
    return `<span class="event-icon-text">
                <span class="material-symbols-outlined">${icon}</span>
                <span class="text">${text}</span>
            </span>
            `
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
}

function linkify(text) {
    if (!text) return "";
    const urlRegex = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

    return escapeHtml(text).replace(urlRegex, (url) => {
        // trailing punctuation is part of the sentence, not the URL
        const trailing = url.match(/[.,!?:)\]}]+$/);
        let tail = "";
        if (trailing) {
            tail = trailing[0];
            url = url.slice(0, -tail.length);
        }

        const href = url.startsWith("http")
            ? url
            : `https://${url}`;

        return `<a class="website" href="${href}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
    });
}

/* === ROLES === */
function roleId(roleLabel) {
    for (const [id, label] of Object.entries(APP_CONFIG.ROLES)) {
        if (label === roleLabel) {
            return id;
        }
    }
    return null;
}

/* === CATEGORIES (an event may have several) === */
function eventCategoryIds(event) {
    const c = event.category;
    if (Array.isArray(c)) return c.map(Number).filter(n => !Number.isNaN(n));
    if (c === null || c === undefined || c === "") return [];
    if (typeof c === "string") return c.split(",").map(s => Number(s.trim())).filter(n => !Number.isNaN(n));
    return [Number(c)];
}

function categoryLabel(ids) {
    if (!ids || ids.length === 0) return "";
    if (ids.length > 1) return "Mixte";
    return APP_CONFIG.CATEGORIES[ids[0]]["label"];
}

function categoryPrimaryId(ids) {
    return (ids && ids.length) ? ids[0] : 0;
}

/* === AREA (derived from the event postal code) === */
function eventAreaId(event) {
    const code = String(event.location_address_code ?? "").trim();
    let fallback = null;
    for (const key of Object.keys(APP_CONFIG.AREAS)) {
        const codes = APP_CONFIG.AREAS[key]["codes"];
        if (!codes) { fallback = key; continue; }  // area without codes = "Ailleurs"
        if (codes.includes(code)) return key;
    }
    return fallback;
}

/* pie ("camembert") background of all category colors; solid when only one */
function categoryPieBackground(ids) {
    if (!ids || ids.length === 0) return APP_CONFIG.CATEGORIES[0]["color"];
    if (ids.length === 1) return APP_CONFIG.CATEGORIES[ids[0]]["color"];
    const slice = 360 / ids.length;
    const stops = ids.map((id, i) =>
        `${APP_CONFIG.CATEGORIES[id]["color"]} ${i * slice}deg ${(i + 1) * slice}deg`
    );
    // start at 45° so 2/4-way splits land on diagonals, not the vertical/horizontal axes
    return `conic-gradient(from 45deg, ${stops.join(", ")})`;
}

/* inline text color for a category label; gradient across all colors when "Mixte" */
function categoryTextStyle(ids) {
    if (!ids || ids.length <= 1) {
        const color = APP_CONFIG.CATEGORIES[(ids && ids[0]) || 0]["color"];
        return `color: ${color};`;
    }
    const stops = ids.map(id => APP_CONFIG.CATEGORIES[id]["color"]).join(", ");
    return `background: linear-gradient(90deg, ${stops}); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;`;
}



function renderAccountPermissionDetails() {
    return `
        <div class="detail-section-list">
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                Publier des évènements
            </div>
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                Editer vos évènements
            </div>
            <div id="permission-official" class="permission denied">
                <span id="icon" class="material-symbols-outlined">lock</span>
                Publier instantanément (sans délais de 3 jours)
            </div>
        </div>
        <div id="permission-admin" class="detail-section-list hidden">
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                Modération: accepter/refuser une nouvelle publication
            </div>
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                Modération: accepter/refuser une requête contributeur "Officiel"
            </div>
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                Modération: supprimer n'importe quel évènement
            </div>
        </div>
        <div id="permission-super-admin" class="detail-section-list hidden">
            <div class="permission granted">
                <span id="icon" class="material-symbols-outlined">check</span>
                <span >Admin: Changer le role d'un contributeur</span>
            </div>
        </div>
    `
}

function setEventImage(container, url) {
    const img = container.querySelector(".event-thumbnail");
    const placeholder = container.querySelector(".image-placeholder");

    // Reset state BEFORE changing src
    img.classList.remove("loaded");
    placeholder.style.display = "flex";  // show loading

    // Set new image
    img.src = url;

    // When image is loaded
    img.onload = () => {
        const ratio = img.naturalWidth / img.naturalHeight;

        const container = img.parentElement;
        container.style.aspectRatio = ratio;

        img.classList.add("loaded");
        placeholder.style.display = "none";
    };

    // Handle error
    // img.onerror = () => {
    //     placeholder.textContent = "image";
    // };
}

function renderEventData(event, details = false) {
    const eventData = event;

    /* categories: normalize to an array + derived display fields */
    eventData.categoryIds = eventCategoryIds(event);
    eventData.categoryPrimaryId = categoryPrimaryId(eventData.categoryIds);
    eventData.categoryLabel = categoryLabel(eventData.categoryIds);
    eventData.categoryPie = categoryPieBackground(eventData.categoryIds);
    eventData.categoryColor = APP_CONFIG.CATEGORIES[eventData.categoryPrimaryId]["color"];
    eventData.categoryColorLight = APP_CONFIG.CATEGORIES[eventData.categoryPrimaryId]["color_light"];
    eventData.categoryIcon = APP_CONFIG.CATEGORIES[eventData.categoryPrimaryId]["icon"];

    /* area derived from the postal code */
    eventData.areaId = eventAreaId(event);

    eventData.categoryHtml = `
        <div class="event-category category cat-${eventData.categoryPrimaryId}" style="color: ${eventData.categoryColor};">
            ${renderMaterialIconText(eventData.categoryIcon, eventData.categoryLabel)}
        </div>
    `
    if (eventData.categoryIds && eventData.categoryIds.length) {
        const catRows = eventData.categoryIds.map(id => {
            const cat = APP_CONFIG.CATEGORIES[id];
            return `<span class="category-row">
                <span class="category-badge" style="background: ${cat["color"]};" title="${cat["label"]}">
                    <span class="material-symbols-outlined">${cat["icon"]}</span>
                </span>
                <span class="category-row-label" style="color: ${cat["color"]};">${cat["label"]}</span>
            </span>`;
        }).join("");

        eventData.categoriesHtml = eventData.categoryIds.length === 1
            ? `<div class="event-categories single">
                    <div class="event-categories-body">
                        <div class="event-categories-rows">${catRows}</div>
                    </div>
                </div>`
            : `<div class="event-categories">
                    <input type="checkbox" id="cat-toggle-${eventData.id}" class="event-categories-toggle">
                    <label class="event-categories-body" for="cat-toggle-${eventData.id}">
                        <div class="event-categories-rows">${catRows}</div>
                        <span class="event-categories-chevron">
                            <span class="material-symbols-outlined chevron">expand_more</span>
                        </span>
                    </label>
                </div>`;
    } else {
        eventData.categoriesHtml = "";
    }

    eventData.locationHtml = `
        <span class="event-icon-text">
            <span class="material-symbols-outlined">place</span>
            <span class="text"><strong>${eventData.location_name} - ${eventData.location_address_town}</strong></span>
        </span>
    `

    eventData.tagsHtml = eventData.tags && eventData.tags.length
        ? `<div class="event-tags">${eventData.tags.map(tag => `<span class="tag">${tag}</span>`).join("")}</div>`
        : "";

    eventData.priceLabel = APP_CONFIG.PRICE_CHOICES[eventData.price]["label"];
    if (eventData.price == 2) {
        if (eventData.min_price) {
            eventData.priceLabel = eventData.min_price + " à " + eventData.max_price + " €";
        } else  {
            eventData.priceLabel = eventData.max_price + " €";
        }
    }

    eventData.ageLabel = "Tout public";
    if (eventData.min_age && eventData.min_age > 0) {
        if (eventData.max_age && eventData.max_age > eventData.min_age) {
            eventData.ageLabel = "De " + eventData.min_age + " à " + eventData.max_age + " ans";
        }
        else {
            eventData.ageLabel = "À partir de " + eventData.min_age + " ans";
        }
    } else if (eventData.max_age && eventData.max_age > 0) {
        eventData.ageLabel = "Jusqu'à " + eventData.max_age + " ans";
    }

    eventData.timeHtml = eventData.event_start_time
        ? `<span class="event-time event-icon-text">
             <span class="material-symbols-outlined">schedule</span>
             <span class="text">${formatEventTime(eventData.event_start_time)}</span>
           </span>`
        : "";

    if (details) {
        // render extra information for event modal
        eventData.imageHtml = eventData.image_url
            ? ` <div class="event-image-wrapper">
                    <div class="image-placeholder"><span class="material-symbols-outlined">image</span></div>
                    <img class="event-thumbnail" alt="image évènement">
                </div>`
            : ` <div class="event-image-wrapper">
                    <div class="image-placeholder no-image"><span class="material-symbols-outlined">local_activity</span></div>
                </div>`;

        eventData.locationAddress = eventData.location_address_2
            ? `${eventData.location_address}, ${eventData.location_address_2}, ${eventData.location_address_code} ${eventData.location_address_town}`
            : `${eventData.location_address} ${eventData.location_address_code} ${eventData.location_address_town}`;

        // clickable address -> universal Google Maps link (opens the app on mobile)
        const mapQuery = encodeURIComponent(`${eventData.location_name}, ${eventData.locationAddress}`);
        eventData.locationAddressHtml = `
            <span class="event-icon-text">
                <span class="material-symbols-outlined">distance</span>
                <span class="text contact"><a class="map" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener noreferrer">${eventData.locationAddress}</a></span>
            </span>`;

        eventData.phoneHtml = eventData.phone
            ? ` <div class="event-meta">
                    <span class="event-icon-text">
                        <span class="material-symbols-outlined">call</span>
                        <span class="text contact"><a class="tel" href="tel:${eventData.phone}">${eventData.phone}</a></span>
                    </span>
                </div>`
            : "";

        eventData.emailHtml = eventData.email
            ? ` <div class="event-meta">
                    <span class="event-icon-text">
                        <span class="material-symbols-outlined">mail</span>
                        <span class="text contact"><a class="mail" href="mailto:${eventData.email}">${eventData.email}</a></span>
                    </span>
                </div>`
            : "";

        eventData.siteUrlHtml = eventData.site_url
            ? `<div class="event-meta">
                    <span class="event-icon-text">
                        <span class="material-symbols-outlined">language</span>
                        <span class="text contact">${linkify(eventData.site_url)}</span>
                    </span>
               </div>`
            : "";

        eventData.eatHtml = eventData.to_eat
            ? `<div class="event-meta">
                    ${renderMaterialIconText("fork_spoon", "À manger sur place")}
               </div>`
            : "";

        eventData.pendingHtml = eventData.pending
            ? ` <div class="event-meta pending">
                    ${renderMaterialIconText("hourglass_top", "En attente de publication")}
                </div>`
            : "";

        eventData.creatorHtml = eventData.creator_name
            ? ` <div class="event-meta">
                    <span class="event-icon-text">
                        <span class="material-symbols-outlined">person_book</span>
                        <span class="text">Créé par</span>
                        <span class="text creator">${eventData.creator_name}</span>
                    </span>
                </div>`
            : "";

        eventData.descriptionHtml = eventData.long_description
            ? `<div id="modal-description" class="modal-description">${linkify(eventData.long_description)}</div>`
            : "";
    }

    return eventData;
}

function configureSelectList(configList, selectList, defaultValue=null) {
    Object.keys(configList).forEach(key => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.innerText = configList[key]["label"]
        selectList.appendChild(opt);
    });
    if (defaultValue != null) {
        selectList.value = defaultValue;
    }
}

/* === OTHERS === */
async function navigatorShareEvent(event, event_url) {
    const event_title = categoryLabel(eventCategoryIds(event));
    const msg_title = event.pending ? "Ici un évènement en attente de publication :" : "Regarde cet évènement !";
    const event_desc = `${msg_title}

Titre: ${event.title}
Type: ${event_title}
Lieu: ${event.location_name}
Date: ${formatDateForUI(event.event_date)}
`;
    
    const clipBoardText = `${event_desc}\n${event_url}`;
    navigator.clipboard.writeText(clipBoardText);

    if (navigator.share) {
        try {
            var file = null;
            if (event.image_url) {
                const response = await fetch(event.image_url);
                const blob = await response.blob();

                file = new File([blob], "event-image.jpg", {
                    type: blob.type
                });
            }
            
            if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: event_title,
                    text: event_desc,
                    url: event_url,
                    files: [file]
                });
            } else {
                // fallback: share link
                await navigator.share({
                    title: event_title,
                    text: event_desc,
                    url: event_url,
                });
            }

        } catch (err) {
            if (err.name === "AbortError") return err;
        }
    } else {
        return "share feature not available on device";
    }
}

async function navigatorShareProfile(profile, profile_url) {
    const profile_title = profile.name;
    const profile_desc = `Regarde cette requête contributeur officiel !

Nom: ${profile.name}
Email: ${profile.email}
Status: ${APP_CONFIG.USER_STATUS[profile.status]["label"]}
Demande: 
"${profile.official_request_details}"
`;
    
    const clipBoardText = `${profile_desc}\n${profile_url}`;
    navigator.clipboard.writeText(clipBoardText);

    if (navigator.share) {
        try {
            await navigator.share({
                title: profile_title,
                text: profile_desc,
                url: profile_url,
            });
        } catch (err) {
            if (err.name === "AbortError") return err;
        }
    } else {
        return "share feature not available on device";
    }
}

function handleAccordion(accordion, accordionId) {
    if (accordion.getAttribute("disabled") === "true") return;
    const isOpen = accordion.getAttribute("aria-expanded") === "true";
    const hiddenSection = document.getElementById(accordionId);
    const searchInput = hiddenSection.querySelector(".data-search");

    accordion.setAttribute("aria-expanded", String(!isOpen));

    if (isOpen) {
        hiddenSection.hidden = true;
        accordion.querySelector(".chevron").innerText = "expand_more";
        if (searchInput) searchInput.value = "";

        /* specific action */
        if (accordionId == "update-role-form") {
            selected_profile = null;
            hiddenSection.querySelector("#profile-email").innerText = "-";
            hiddenSection.querySelector("#profile-name").innerText = "-";
            hiddenSection.querySelector("#profile-role").innerText = "-";
            hiddenSection.querySelector("#roles").value = APP_CONFIG.ROLES[0];
            hiddenSection.querySelector("#update-role-button").disabled = true; 
        }
    } else {
        /* open this one */
        hiddenSection.hidden = false;
        accordion.querySelector(".chevron").innerText = "expand_less";
    }
}


/* === DEBUG === */
// Persistent debug log that survives page reloads (PC debug only).
// Stored in localStorage so it stays available after window.location.reload().
// After a reload, type showLog() in the console to print it, clearLog() to wipe it.
const _LOG_KEY = "debug_log";

function fileLog(text) {
    if (typeof APP_CONFIG === "undefined" || !APP_CONFIG.DEV) return; // debug only

    const line = `[${new Date().toISOString()}] ${text}`;
    console.log(line);
    try {
        const prev = localStorage.getItem(_LOG_KEY) || "";
        localStorage.setItem(_LOG_KEY, `${prev}${line}\n`);
    } catch (err) {
        console.warn("fileLog failed:", err);
    }
}

function showLog() {
    console.log(localStorage.getItem(_LOG_KEY) || "(log empty)");
}

function clearLog() {
    localStorage.removeItem(_LOG_KEY);
}

