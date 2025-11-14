document.getElementById('consentButton').addEventListener('click', () => {
    chrome.storage.local.set({ hasConsented: true, isEnabled: true }, () => {
        window.close();
    });
});
