// Lien « Application » : si ce guide a été ouvert depuis l'appli encore ouverte, on revient à son onglet et on ferme celui-ci
document.querySelectorAll('a[href="/"]').forEach(link => {
    link.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
        const app = window.opener;
        if (!app || app.closed) return;
        try {
            if (app.location.origin !== location.origin || app.location.pathname !== '/') return;
        } catch (err) {
            return;
        }
        e.preventDefault();
        app.focus();
        window.close();
    });
});
