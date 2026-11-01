/* © 2026 nico-ia (https://github.com/nico-ia). Tous droits réservés. */

// Fenêtres de dialogue de l'application : remplacent confirm() et prompt() du navigateur.
// Une seule fenêtre à la fois. Entrée valide, Échap annule. Les touches de l'application sont bloquées tant qu'elle est ouverte.
let appDialogSettle = null;
let appDialogValidate = null;
let appDialogFocusBefore = null;

function appDialogShow({ title, message = '', fields = [], okLabel = 'OK', cancelLabel = 'Annuler', danger = false, validate = null }) {
    document.getElementById('app-dialog-title').textContent = title;
    const msg = document.getElementById('app-dialog-message');
    msg.textContent = message;
    msg.classList.toggle('hidden', !message);
    document.getElementById('app-dialog-error').classList.add('hidden');
    document.getElementById('app-dialog-cancel').textContent = cancelLabel;
    const okBtn = document.getElementById('app-dialog-ok');
    okBtn.textContent = okLabel;
    okBtn.className = 'px-3 py-1.5 rounded-lg text-white text-xs font-semibold ' +
        (danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500');
    const box = document.getElementById('app-dialog-fields');
    box.innerHTML = '';
    fields.forEach(f => {
        const label = document.createElement('label');
        label.className = 'block text-xs text-slate-300';
        label.textContent = f.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.dataset.key = f.id;
        input.value = f.value ?? '';
        input.inputMode = f.inputmode || 'text';
        input.className = 'mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-white focus:outline-none focus:border-emerald-500';
        label.appendChild(input);
        box.appendChild(label);
    });
    appDialogValidate = validate;
    appDialogFocusBefore = document.activeElement;
    document.getElementById('app-dialog').classList.remove('hidden');
    return new Promise(resolve => {
        appDialogSettle = resolve;
        const first = box.querySelector('input');
        if (first) { first.focus(); first.select(); }
        else (danger ? document.getElementById('app-dialog-cancel') : okBtn).focus();
    });
}

// Résultat : { clé: valeur } si validé, null si annulé
function closeAppDialog(result) {
    const settle = appDialogSettle;
    appDialogSettle = null;
    appDialogValidate = null;
    document.getElementById('app-dialog').classList.add('hidden');
    if (appDialogFocusBefore && appDialogFocusBefore.focus) appDialogFocusBefore.focus();
    appDialogFocusBefore = null;
    settle(result);
}

function appDialogSubmit() {
    const values = {};
    document.querySelectorAll('#app-dialog-fields input').forEach(input => { values[input.dataset.key] = input.value.trim(); });
    const error = appDialogValidate ? appDialogValidate(values) : null;
    if (error) {
        const box = document.getElementById('app-dialog-error');
        box.textContent = error;
        box.classList.remove('hidden');
        return;
    }
    closeAppDialog(values);
}

// Renvoie true si l'utilisateur valide, false sinon
function askConfirm(title, message, okLabel, { danger = false, cancelLabel } = {}) {
    return appDialogShow({ title, message, okLabel, danger, cancelLabel }).then(r => r !== null);
}

// Renvoie { clé: valeur } si validé, null si annulé
function askFields(title, fields, okLabel, validate = null) {
    return appDialogShow({ title, fields, okLabel, validate });
}

document.getElementById('app-dialog-ok').addEventListener('click', appDialogSubmit);
document.getElementById('app-dialog-cancel').addEventListener('click', () => closeAppDialog(null));
document.getElementById('app-dialog-close').addEventListener('click', () => closeAppDialog(null));

// Phase de capture : la touche ne parvient pas aux raccourcis de l'application pendant que la fenêtre est ouverte
window.addEventListener('keydown', (e) => {
    if (!appDialogSettle) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); closeAppDialog(null); }
    else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); appDialogSubmit(); }
}, true);
