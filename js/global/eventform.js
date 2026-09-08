console.log("executing:", "eventform.js");

import { openErrorModal } from "./modal.js?v=922c735a.4eafc3e";
import { tagInput, userTags, clearTags, addTag } from "./tags.js?v=922c735a.4eafc3e";
// import { parsePhoneNumber, AsYouType } from 'libphonenumber-js'

/* === VARIABLES === */
const today = startOfDay(new Date());

const form = document.getElementById("event-form");
const categoryChoices = document.getElementById("category-choices");
const parentalGuideList = document.getElementById("pg");
const priceChoiceList = document.getElementById("price-choice");
const minPrice = document.getElementById("min_price");
const maxPrice = document.getElementById("max_price");
const eventImage = document.getElementById("event-image");
const deleteImageBtn = document.getElementById("remove-image-btn");

let currentImageUrl = null;
let imageToUpload = null;
let selectedCategories = new Set();

/* === LOCAL FUNCTIONS === */
async function resizeImage(file, maxWidth = 1200, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();

        reader.onload = () => {
            img.src = reader.result;
            showImagePreview(file.name, img.src);
        };

        img.onload = () => {
            const scale = Math.min(1, maxWidth / img.width);
            const canvas = document.createElement("canvas");

            canvas.width = img.width * scale;
            canvas.height = img.height * scale;

            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
                (blob) => resolve(blob),
                "image/jpeg",
                quality
            );
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showImagePreview(image_name, image_src) {
    deleteImageBtn.hidden = false;
    form.querySelector(".event-image-wrapper").hidden = false;
    form.querySelector("#event-thumbnail").src = image_src;
    form.querySelector("#file-name").textContent = image_name;
}

function renderCategoryChoices() {
    categoryChoices.innerHTML = "";
    Object.keys(APP_CONFIG.CATEGORIES).forEach(key => {
        const cat = APP_CONFIG.CATEGORIES[key];
        const isSelected = selectedCategories.has(key);
        categoryChoices.innerHTML += `
            <button type="button" class="category-chip ${isSelected ? "selected" : ""}" data-action="toggle-category" data-category="${key}" style="--chip-color: ${cat.color};" aria-pressed="${isSelected}">
                <span class="material-symbols-outlined">${cat.icon}</span>
                ${cat.label}
            </button>`;
    });
}

/* === EXPORTED FUNCTIONS === */
export function toggleCategory(el) {
    const key = el.dataset.category;
    if (selectedCategories.has(key)) {
        selectedCategories.delete(key);
        el.classList.remove("selected");
        el.setAttribute("aria-pressed", "false");
    } else {
        selectedCategories.add(key);
        el.classList.add("selected");
        el.setAttribute("aria-pressed", "true");
    }
    console.log("selectedCategories:", selectedCategories);
}

/* === EXPORTED FUNCTIONS === */
export function initEventForm(eventData=null) {
    form.reset()
    currentImageUrl = null;
    imageToUpload = null;

    /* Configure select lists  */
    configureSelectList(APP_CONFIG.PRICE_CHOICES, priceChoiceList, 0);

    /* init category choices */
    selectedCategories = new Set();
    renderCategoryChoices();

    /* init userTags */
    clearTags();

    if (!eventData) return;

    /* init form with data */
    form.querySelector("#title").value = eventData.title;
    form.querySelector("#location_name").value = eventData.location_name;
    form.querySelector("#location_address").value = eventData.location_address;
    form.querySelector("#location_address_2").value = eventData.location_address_2 || "";
    form.querySelector("#location_address_code").value = eventData.location_address_code || "";
    form.querySelector("#location_address_town").value = eventData.location_address_town || "";
    if (eventData.long_description) form.querySelector("#long_description").value = eventData.long_description;
    eventCategoryIds(eventData).forEach(id => selectedCategories.add(String(id)));
    renderCategoryChoices();
    form.querySelector("#min_age").value = eventData.min_age;
    form.querySelector("#max_age").value = eventData.max_age;
    form.querySelector("#event_date").value = eventData.event_date;
    if (eventData.event_start_time) form.querySelector("#event_start_time").value = eventData.event_start_time;
    if (eventData.tags) eventData.tags.forEach(t => addTag(t));
    if (eventData.phone) form.querySelector("#phone").value = eventData.phone;
    if (eventData.email) form.querySelector("#email").value = eventData.email;
    if (eventData.site_url) form.querySelector("#site_url").value = eventData.site_url;
    if (eventData.to_eat) form.querySelector('input[name="to_eat"]').checked = eventData.to_eat;
    priceChoiceList.value = eventData.price;
    if (eventData.price == 2) {
        if (eventData.max_price && (eventData.max_price > 0)) {
            form.querySelector('#max_price').value = eventData.max_price;
            if (eventData.min_price && (eventData.min_price > 0)) form.querySelector('#min_price').value = eventData.min_price;
        }
    }
    priceChoiceList.dispatchEvent(new Event("change", { bubbles: true }));

    if (eventData.image_url) {
        currentImageUrl = eventData.image_url;
        const fileName = currentImageUrl.split("/").pop();
        showImagePreview(fileName, currentImageUrl);
    }
}

export function priceChanged(target) {
    if (target.value == 2) {
        minPrice.disabled = false;
        maxPrice.disabled = false;
    }
    else
    {
        minPrice.disabled = true;
        minPrice.value = "0.00";
        maxPrice.disabled = true;
        maxPrice.value = "0.00";
    }
}

export async function handleImageChoice(file) {
    if (file.size > 10_000_000) {
        button.setAttribute("aria-busy", "false");
        openErrorModal("Image trop lourde (10Mo maximum");
        eventImage.value = "";
        return;
    }
    imageToUpload = await resizeImage(file);
}

export async function uploadImageFile() {
    /* check image has changed */
    if (imageToUpload) {
        console.log("upload image");
        const fileName = `event-${crypto.randomUUID()}.jpg`;
        const storage = window.supabaseClient.storage.from("event-images");
        const { data, error } = await storage
            .upload(fileName, imageToUpload, {
                contentType: "image/jpeg",
                cacheControl: "3600",
                upsert: false
            });
        if (error) {
            return {imageUrl: null, error: error};
        }
        const publicUrlResult = storage.getPublicUrl(data.path);
        const publicUrl = publicUrlResult.data?.publicUrl ?? publicUrlResult.publicURL;

        if (!publicUrl) {
            return {imageUrl: null, error: new Error("Impossible d'obtenir l'URL publique de l'image")};
        }

        return {imageUrl: publicUrl, error: null};
    } else {
        return {imageUrl: currentImageUrl, error: null};
    }
}

export function removeImage() {
    imageToUpload = null;
    currentImageUrl = null;
    eventImage.value = "";
    deleteImageBtn.hidden = true;
    form.querySelector(".event-image-wrapper").hidden = true;
    form.querySelector("#event-thumbnail").src = "";
    form.querySelector("#file-name").textContent = "aucun fichier choisi";
}

export function formatPhoneInput(input) {
    const phoneFormatter = new libphonenumber.AsYouType();
    input.value = phoneFormatter.input(input.value.replace(/[^\d+]/g, ""));
}

export function getEventFormPayload() {
    const eventDate = form.querySelector("#event_date");
    const endDate = form.querySelector("#end_date");
    const phoneInput = form.querySelector("#phone");
    const long_description = form.querySelector('#long_description').value
    const start_time = form.querySelector('#event_start_time').value;
    const toEat = form.querySelector('input[name="to_eat"]').checked;

    /* combine address parts (keeps postal code + town in the saved address) */
    const addressStreet = form.querySelector('#location_address').value.trim();
    const addressExtra = form.querySelector('#location_address_2').value.trim();
    const addressCode = form.querySelector('#location_address_code').value.trim();
    const addressTown = form.querySelector('#location_address_town').value.trim();

    var phoneNumber = null;

    /* reset form custom validity */
    phoneInput.setCustomValidity("");
    tagInput.setCustomValidity("");
    eventDate.setCustomValidity("");
    endDate.setCustomValidity("");
    minPrice.setCustomValidity("");

    /* check phone number */
    if (phoneInput.value && (phoneInput.value != "")) {
        try {
            const numData = libphonenumber.parsePhoneNumber(form.querySelector('#phone').value);
            if (!numData.isValid()) {
                phoneInput.setCustomValidity("Numéro invalide");
            } else {
                phoneNumber = numData.number;
            
            }
        } catch {
            phoneInput.setCustomValidity("Numéro invalide");
        }
    }

    /* check userTags */
    if (userTags.length > 4) {
        tagInput.setCustomValidity("Maximum 4 tags");
    }

    // check dates
    var nb_days = 1;
    if (new Date(eventDate.value) < today) {
        eventDate.setCustomValidity("La date doit être à partir de aujourd'hui");
    }

    if (endDate.value && (endDate.value != "")) {
        if (new Date(endDate.value) <= new Date(eventDate.value)) {
            endDate.setCustomValidity("La date de fin doit être à strictement supérieure à la date de début");
        } else {
            nb_days = Math.round((new Date(endDate.value + "T00:00:00") - new Date(eventDate.value + "T00:00:00")) / 86400000) + 1;  // 86400000ms per day
   
        }
    }

    /* set price */
    var min_price = null;
    var max_price = null;
    if (priceChoiceList.value == 2) {
        min_price = minPrice.value.trim() === "" ? null: Number(minPrice.value);
        max_price = maxPrice.value.trim() === "" ? null: Number(maxPrice.value);
        if (min_price && max_price && (min_price > max_price))
        {
            minPrice.setCustomValidity("Le prix réduit doit être inférieur au prix normal");
        }
    }

    /* report form validity */
    if (!form.checkValidity()) {
        form.reportValidity(); // shows native errors
        return;
    };

    /* require at least one category */
    console.log("selectedCategories:", selectedCategories);
    if (selectedCategories.size === 0) {
        openErrorModal("Choisissez au moins une catégorie");
        return;
    }
        
    const tags = userTags.map((t) => t.trim().toLowerCase())
        .filter(Boolean);
    
    const payload = {
        title: form.querySelector('#title').value,
        long_description: long_description === "" ? null : long_description,
        // event_date: done later
        event_start_time: start_time === "" ? null : start_time,
        location_name: form.querySelector('#location_name').value,
        location_address: addressStreet,
        location_address_2: addressExtra === "" ? null : addressExtra,
        location_address_code: addressCode,
        location_address_town: addressTown,
        tags,
        // pending: done later
        is_test: userTags.includes("is_test"),
        // created_by: done later
        // creator: done later
        price: priceChoiceList.value,
        min_price: min_price,
        max_price: max_price,
        category: Array.from(selectedCategories).map(Number).sort((a, b) => a - b),
        // image_url: done later
        phone: phoneNumber,
        email: form.querySelector("#email").value,
        site_url: form.querySelector('#site_url').value,
        min_age: form.querySelector('#min_age').value.trim() === "" ? null : Number(form.querySelector('#min_age').value),
        max_age: form.querySelector('#max_age').value.trim() === "" ? null : Number(form.querySelector('#max_age').value),
        to_eat: toEat
    }

    return {payload: payload, nb_days: nb_days}
}


