console.log("executing:", "account_reset_pwd.js");

import {openErrorModal, openSuccessModal} from "../global/modal.js?v=a99d250f.c252ac8";

/* === VARIABLES === */
const resetPwdForm = document.getElementById("reset-pwd-form");

/* === LOCAL FUNCTIONS === */
export async function resetPassword() {
    const passwordValue = resetPwdForm.querySelector("#password").value;
    const passwordConfirm = resetPwdForm.querySelector("#passwordConfirm");
    const passwordConfirmValue = passwordConfirm.value;
    const button = resetPwdForm.querySelector("#button");

    /* init UI */
    passwordConfirm.setAttribute("aria-invalid", null);
    button.setAttribute("aria-busy", "true");

    if (passwordValue !== passwordConfirmValue) {
        passwordConfirm.setAttribute("aria-invalid", "true");
        button.setAttribute("aria-busy", "false");
        openErrorModal("Mots de passes non identiques");
        passwordConfirm.focus();
        return;
    }

    const { error } = await window.supabaseClient.auth.updateUser({
        password: passwordValue
    });

    button.setAttribute("aria-busy", "false");

    if (error) {
        openErrorModal(localizeAuthError(error));
        console.error("reset password failed:", error);
        return;
    }

    resetPwdForm.reset();
    openSuccessModal("Mot de passe réinitialisé ! Vous allez être redirigé automatiquement.");
    
    setTimeout(() => {
        window.location.href = `../account`;
    }, 3000);
}
