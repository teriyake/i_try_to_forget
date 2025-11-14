chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        chrome.tabs.create({ url: 'onboarding.html' });
    }

    chrome.alarms.create('memoryCollector', {
        delayInMinutes: 0,
        periodInMinutes: 0.1,
    });
    console.log('Memory collector alarm created.');
});

const scrapeAndStoreMemory = (tabId) => {
    chrome.scripting.executeScript(
        {
            target: { tabId: tabId },
            function: () => {
                let memory = null;

                if (Math.random() > 0.9) {
                    const allImages = Array.from(
                        document.querySelectorAll('img'),
                    ).map((img) => img.src);
                    const validImages = allImages.filter(
                        (src) =>
                            src &&
                            typeof src === 'string' &&
                            src.startsWith('http') &&
                            !src.endsWith('.svg'),
                    );

                    const largeEnoughImages = Array.from(
                        document.querySelectorAll('img'),
                    ).filter(
                        (img) =>
                            img.complete &&
                            img.naturalWidth > 150 &&
                            img.naturalHeight > 150,
                    );

                    if (largeEnoughImages.length > 0) {
                        const randomImage =
                            largeEnoughImages[
                                Math.floor(
                                    Math.random() * largeEnoughImages.length,
                                )
                            ];
                        memory = { type: 'image', content: randomImage.src };
                    }
                }

                if (!memory) {
                    const allText = document.body.innerText;
                    const words = allText.split(/\s+/);
                    if (words.length > 20) {
                        const start = Math.floor(
                            Math.random() * (words.length - 20),
                        );
                        const textSnippet = words
                            .slice(start, start + 20)
                            .join(' ');
                        memory = { type: 'text', content: textSnippet };
                    }
                }

                return memory;
            },
        },
        (injectionResults) => {
            if (
                chrome.runtime.lastError ||
                !injectionResults ||
                !injectionResults[0] ||
                !injectionResults[0].result
            ) {
                return;
            }
            const newMemory = injectionResults[0].result;
            if (!newMemory) return;

            chrome.storage.local.get({ memories: [] }, (data) => {
                const memories = data.memories;
                memories.push(newMemory);
                if (memories.length > 100) {
                    memories.shift();
                }
                chrome.storage.local.set({ memories: memories });
            });
        },
    );
};

const attemptToScrape = (tabId) => {
    chrome.storage.local.get(['hasConsented', 'isEnabled'], (data) => {
        if (data.hasConsented && data.isEnabled) {
            scrapeAndStoreMemory(tabId);
        }
    });
};

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'memoryCollector') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (
                tabs &&
                tabs[0] &&
                tabs[0].url &&
                tabs[0].url.startsWith('http')
            ) {
                attemptToScrape(tabs[0].id);
            }
        });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (
        changeInfo.status === 'complete' &&
        tab.url &&
        tab.url.startsWith('http')
    ) {
        attemptToScrape(tabId);
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getMemory') {
        chrome.storage.local.get({ memories: [] }, (data) => {
            const memories = data.memories;
            let randomMemory = null;
            if (memories.length > 0) {
                randomMemory =
                    memories[Math.floor(Math.random() * memories.length)];
            }
            sendResponse({ memory: randomMemory });
        });
        return true;
    } else if (message.action === 'fetchImageAsDataURL') {
        fetch(message.url)
            .then((response) => response.blob())
            .then((blob) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ dataUrl: reader.result });
                };
                reader.readAsDataURL(blob);
            })
            .catch((error) => {
                console.error('Error fetching image:', error);
                sendResponse({ error: error.message });
            });
        return true;
    }
});
