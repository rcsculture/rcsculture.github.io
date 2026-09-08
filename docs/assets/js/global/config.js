console.log("executing:", "config.js");

SITE_URL = "https://planetraves.fr"

APP_CONFIG = {
    DEV: __DEPLOY_DEV__,
    SUPABASE_URL: "__SUPABASE_URL__",
    SUPABASE_ANON_KEY: "__SUPABASE_ANON_KEY__",
    EMAIL_ADDRESS: "__SUPABASE_EMAIL_ADDRESS__",
    EMAIL_NAME: "__SUPABASE_EMAIL_NAME__",
    EMAILCONFIRMED_REDIRECT_URL: SITE_URL + "/account_confirmed/",
    RESETPWD_REDIRECT_URL: SITE_URL + "/account_reset_pwd/",
    ROLES: {
        0: "Non-Officiel",
        1: "Officiel",
        2: "Modérateur·rice",
        3: "Admin"
    },
    USER_STATUS: {
        0: {
            "label": "Particulier·ère",
            "example": ["habitant·e"]
        },
        1: {
            "label": "Acteur·rice individuel·le",
            "example": ["artiste indépendant·e", "Auteur·rice / Écrivain·e", "Musicien·ne", "Dj", "Performeur·euse"]
        },
        2: {
            "label": "Organisation artistique",
            "example": ["compagnie", "orchestre", "groupe de musique", "collectif", "troupe"]
        },
        3: {
            "label": "Structure évènementielle",
            "example": ["société de production", "agence", "festival", "programmateur·rice", "organisateur·rice"]
        },
        4: {
            "label": "Lieu culturel privé",
            "example": ["théatre", "salle de concert", "bar", "galerie", "cinéma"]
        },
        5: {
            "label": "Lieu public",
            "example": ["médiathèque", "musée", "théatree", "centre", "MJC"]
        },
        6: {
            "label": "Collectif",
            "example": ["collectif artistique", "groupe citoyen", "réseau militant"]
        },
        7: {
            "label": "Acteur·rice du patrimoine et du tourisme",
            "example": ["office de tourisme", "site patrimonial", "parc historique"]
        },
        8: {
            "label": "Média culturel",
            "example": ["radio", "TV", "platefrom numérique", "label", "maison d'édition", "studio"]
        },
        9: {
            "label": "Acteur·rice social·e",
            "example": ["centre social", "maison de quartier", "structure", "animateur·rice culturel·le", "réseau éducatif", "EHPAD", "MJC", "ONG"]
        },
        10: {
            "label": "Association",
            "example": []
        },
        11: {
            "label": "Autre",
            "example": []
        }
    },
    CATEGORIES: {
        0: {
            "label": "Concert",
            "icon": "music_note_2",
            "color": "#FF46A0",
            "color_light": "#ffeef6"
        },
        1: {
            "label": "Spectacle",
            "icon": "theater_comedy",
            "color": "#0064BF",
            "color_light": "#eaf5ff"
        },
        2: {
            "label": "Projection",
            "icon": "video_camera_back",
            "color": "#01A971",
            "color_light": "#f6fffc"
        },
        3: {
            "label": "Exposition",
            "icon": "palette",
            "color": "#D99AB4",
            "color_light": "#fff0f6"
        },
        4: {
            "label": "Rencontre",
            "icon": "auto_stories",
            "color": "#FF9F1F",
            "color_light": "#fff8ef"
        },
        5: {
            "label": "Autre",
            "icon": "star",
            "color": "#DDDB2A",
            "color_light": "#fffff1"
        }
    },
    PRICE_CHOICES: {
        0: {
            "label": "Gratuit"
        },
        1: {
            "label": "Prix libre"
        },
        2: {
            "label": "Payant"
        }
    },
    AREAS: {
        0: {
            "label": "Rabas/Couf",
            "icon": "explore_nearby",
            "codes": ["81800"]
        },
        1: {
            "label": "Salvagnac",
            "icon": "explore_nearby",
            "codes": ["81630"]
        },
        2: {
            "label": "Ailleurs",
            "icon": "explore_nearby"
        }
    },
    WHEN: {
        0: {
            "label": "Aujourd'hui"
        },
        1: {
            "label": "Prochainement"
        }
    },
    API_TIMEOUT_MS: 5000
};

/* create color variables for CSS */
document.documentElement.style.setProperty("--category0", `${APP_CONFIG.CATEGORIES[0]["color"]} !important`);
document.documentElement.style.setProperty("--category1", `${APP_CONFIG.CATEGORIES[1]["color"]} !important`);
document.documentElement.style.setProperty("--category2", `${APP_CONFIG.CATEGORIES[2]["color"]} !important`);
document.documentElement.style.setProperty("--category3", `${APP_CONFIG.CATEGORIES[3]["color"]} !important`);
document.documentElement.style.setProperty("--category4", `${APP_CONFIG.CATEGORIES[4]["color"]} !important`);
document.documentElement.style.setProperty("--category5", `${APP_CONFIG.CATEGORIES[5]["color"]} !important`);
document.documentElement.style.setProperty("--category0--light", APP_CONFIG.CATEGORIES[0]["color_light"]);
document.documentElement.style.setProperty("--category1--light", APP_CONFIG.CATEGORIES[1]["color_light"]);
document.documentElement.style.setProperty("--category2--light", APP_CONFIG.CATEGORIES[2]["color_light"]);
document.documentElement.style.setProperty("--category3--light", APP_CONFIG.CATEGORIES[3]["color_light"]);
document.documentElement.style.setProperty("--category4--light", APP_CONFIG.CATEGORIES[4]["color_light"]);
document.documentElement.style.setProperty("--category5--light", APP_CONFIG.CATEGORIES[5]["color_light"]);

