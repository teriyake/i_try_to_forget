document.addEventListener('DOMContentLoaded', () => {
    const enabledToggle = document.getElementById('enabledToggle');
    const memoryList = document.getElementById('memoryList');
    const memoryCount = document.getElementById('memoryCount');
    const clearButton = document.getElementById('clearButton');

    const renderMemories = (memories = []) => {
        memoryList.innerHTML = '';
        memoryCount.textContent = memories.length;

        if (memories.length === 0) {
            const li = document.createElement('li');
            memoryList.appendChild(li);
            return;
        }

        memories.forEach((memory, index) => {
            const li = document.createElement('li');

            const content = document.createElement('span');
            content.classList.add('memory-content');

            if (memory.type === 'image') {
                const img = document.createElement('img');
                img.src = memory.content;
                content.appendChild(img);
                content.append('Image memory');
            } else {
                content.textContent = `"${memory.content}"`;
            }

            li.appendChild(content);

            li.addEventListener('click', () => {
                showMemoryModal(memory, index);
            });

            memoryList.appendChild(li);
        });
    };

    const showMemoryModal = (memory, index) => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        const content = document.createElement('div');
        content.className = 'modal-content';
        const header = document.createElement('div');
        header.className = 'modal-header';
        const title = document.createElement('h3');
        title.textContent = `Memory ${index + 1} of ${memoryCount.textContent}`;
        const closeButton = document.createElement('button');
        closeButton.className = 'modal-close';
        closeButton.innerHTML = '&times;';
        closeButton.setAttribute('aria-label', 'Close modal');
        closeButton.addEventListener('click', () => {
            closeModal(overlay);
        });

        header.appendChild(title);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.className = 'modal-body';

        if (memory.type === 'text') {
            body.classList.add('text-memory');
            body.textContent = memory.content;
        } else if (memory.type === 'image') {
            body.classList.add('image-memory');
            const img = document.createElement('img');
            img.src = memory.content;
            img.alt = 'Memory image';
            body.appendChild(img);
        }

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete this memory';
        deleteBtn.classList.add('delete-btn');
        deleteBtn.title = 'Delete this memory';
        deleteBtn.dataset.index = index;

        deleteBtn.addEventListener('click', (event) => {
            closeModal(overlay);

            const indexToDelete = parseInt(event.target.dataset.index, 10);
            chrome.storage.local.get({ memories: [] }, (data) => {
                const updatedMemories = data.memories;
                updatedMemories.splice(indexToDelete, 1);
                chrome.storage.local.set({ memories: updatedMemories }, () => {
                    renderMemories(updatedMemories);
                });
            });
        });

        content.appendChild(header);
        content.appendChild(body);
        content.appendChild(deleteBtn);
        overlay.appendChild(content);

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                closeModal(overlay);
            }
        });

        const escapeHandler = (event) => {
            if (event.key === 'Escape') {
                closeModal(overlay);
                document.removeEventListener('keydown', escapeHandler);
            }
        };

        document.addEventListener('keydown', escapeHandler);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add('active');
        }, 10);
    };

    const closeModal = (overlay) => {
        overlay.classList.remove('active');

        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        }, 300);
    };

    chrome.storage.local.get(['isEnabled', 'memories'], (data) => {
        enabledToggle.checked = !!data.isEnabled;
        renderMemories(data.memories);
    });

    enabledToggle.addEventListener('change', (event) => {
        chrome.storage.local.set({ isEnabled: event.target.checked });
    });

    clearButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all memories?')) {
            chrome.storage.local.set({ memories: [] }, () => {
                renderMemories([]);
            });
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.memories) {
            renderMemories(changes.memories.newValue);
        }
        if (namespace === 'local' && changes.isEnabled) {
            enabledToggle.checked = !!changes.isEnabled.newValue;
        }
    });
});
