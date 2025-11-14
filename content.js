const activeMemories = [];

const ERASURE_THRESHOLD = 450;
const ERASER_SIZE = 20;
const MEMORY_LIFETIME = 75000;
const MAX_ACTIVE_MEMORIES = 10;

let memoryInterval = null;

const startInjectingMemories = () => {
    if (memoryInterval) return;

    memoryInterval = setInterval(() => {
        chrome.storage.local.get('isEnabled', (data) => {
            if (!data.isEnabled) return;

            if (activeMemories.length >= MAX_ACTIVE_MEMORIES) return;

            if (Math.random() < 0.9) {
                chrome.runtime.sendMessage(
                    { action: 'getMemory' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            console.error(chrome.runtime.lastError.message);
                            return;
                        }
                        if (response && response.memory) {
                            injectMemory(response.memory);
                        }
                    },
                );
            }
        });
    }, 5000);
};

const stopInjectingMemories = () => {
    if (memoryInterval) {
        console.log('Stopping memory injections.');
        clearInterval(memoryInterval);
        memoryInterval = null;
    }
};

chrome.storage.local.get('isEnabled', (data) => {
    if (data.isEnabled) {
        startInjectingMemories();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.isEnabled) {
        const isNowEnabled = !!changes.isEnabled.newValue;
        if (isNowEnabled) {
            startInjectingMemories();
        } else {
            stopInjectingMemories();
        }
    }
});

const col2RGBA = (col, alpha = 0.75) => {
    if (col[0] !== '#') {
        if (col.slice(0, 4) === 'rgba') {
            return col
                .split('(')[1]
                .split(')')[0]
                .split(',')
                .reduce((rgba, curr, i) => {
                    if (i === 3) {
                        return rgba + alpha + ')';
                    }
                    return rgba + curr + ',';
                }, 'rgba(');
        }
        if (col.slice(0, 3) === 'rgb') {
            col = col
                .split('(')[1]
                .split(')')[0]
                .split(',')
                .reduce((rgba, curr, i) => rgba + curr + ',', 'rgba(');
            return col + alpha + ')';
        }
        return `rgba(0, 0, 0, ${alpha})`;
    }

    hex = col;
    if (hex.length < 6) {
        hex = hex
            .split('')
            .map((d) => {
                if (d == '#') {
                    return d;
                }
                return d + d;
            })
            .join('');
    }

    var r = parseInt(hex.slice(1, 3), 16),
        g = parseInt(hex.slice(3, 5), 16),
        b = parseInt(hex.slice(5, 7), 16);

    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
};

const wrapText = (context, text, x, y, maxWidth, lineHeight, textColor) => {
    const words = text.split(' ');
    let line = '';
    context.fillStyle = textColor;

    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = context.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            context.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    context.fillText(line, x, y);
};

const injectMemory = (memory) => {
    if (!memory) return;

    const memoryContainer = document.createElement('div');
    memoryContainer.classList.add('memory-container');
    const memoryCanvas = document.createElement('canvas');
    const ctx = memoryCanvas.getContext('2d');

    const computedStyle = window.getComputedStyle(document.body);
    const bodyTextColor = computedStyle.color || 'black';
    const bodyBgColor = computedStyle.backgroundColor;
    const memoryBorderColor = col2RGBA(bodyTextColor, 0.55);

    memoryContainer.style.position = 'fixed';
    memoryContainer.style.zIndex = '99999';
    memoryContainer.style.top = `${Math.random() * 80}vh`;
    memoryContainer.style.left = `${Math.random() * 80}vw`;
    memoryContainer.style.opacity = '0';
    memoryContainer.style.transition = 'opacity 3s ease-in-out';
    memoryContainer.style.pointerEvents = 'auto';
    memoryContainer.style.animation = 'memoryPulse 4s ease-in-out infinite';

    if (memory.type === 'text') {
        const maxWidth = 300;
        const lineHeight = 20;
        const padding = 15;

        memoryCanvas.width = maxWidth + padding * 2;
        memoryCanvas.height = 120;
        ctx.font = computedStyle.font;

        wrapText(
            ctx,
            `... ${memory.content} ...`,
            padding,
            padding + lineHeight,
            maxWidth,
            lineHeight,
            bodyTextColor,
        );

        memoryContainer.style.border = `1px dashed ${memoryBorderColor}`;
        memoryContainer.style.backdropFilter = 'blur(2px)';
    } else if (memory.type === 'image') {
        chrome.runtime.sendMessage(
            { action: 'fetchImageAsDataURL', url: memory.content },
            (response) => {
                if (response && response.dataUrl) {
                    const img = new Image();
                    img.src = response.dataUrl;

                    img.onload = () => {
                        const maxWidth = 250;
                        const maxHeight = 250;
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > maxWidth) {
                                height *= maxWidth / width;
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxHeight) {
                                width *= maxHeight / height;
                                height = maxHeight;
                            }
                        }

                        memoryCanvas.width = width;
                        memoryCanvas.height = height;

                        ctx.filter =
                            'grayscale(80%) sepia(50%) blur(0.5px) contrast(1.2)';
                        ctx.drawImage(img, 0, 0, width, height);

                        memoryCanvas.style.mixBlendMode = 'screen';
                    };
                } else {
                    console.error(
                        'Failed to load image via background script:',
                        response.error,
                    );
                    return;
                }
            },
        );

        memoryContainer.style.padding = '10px';
        memoryContainer.style.border = `1px dashed ${memoryBorderColor}`;
        memoryContainer.style.backdropFilter = 'blur(1px)';
    }

    memoryContainer.appendChild(memoryCanvas);

    const memoryState = {
        element: memoryContainer,
        erasureAmount: 0,
        type: memory.type,
        createdAt: Date.now(),
    };

    const erase = (e) => {
        const rect = memoryCanvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        ctx.globalCompositeOperation = 'destination-out';

        ctx.beginPath();
        ctx.arc(x, y, ERASER_SIZE, 0, 2 * Math.PI);
        ctx.fillStyle = `${col2RGBA('#000', 0.3)}`;
        ctx.fill();

        memoryState.erasureAmount++;
        if (memoryState.erasureAmount >= ERASURE_THRESHOLD) {
            removeMemory(memoryState);
            memoryCanvas.removeEventListener('mousemove', erase);
        }
    };

    memoryCanvas.addEventListener('mousemove', erase);

    document.body.appendChild(memoryContainer);
    activeMemories.push(memoryState);

    setTimeout(() => {
        memoryContainer.style.opacity = 0.7;
        memoryContainer.style.setProperty('--memory-opacity', '0.7');
    }, 100);

    setTimeout(() => {
        removeMemory(memoryState);
    }, MEMORY_LIFETIME);
};

const removeMemory = (memoryState) => {
    const index = activeMemories.indexOf(memoryState);
    if (index === -1) return;

    memoryState.element.style.opacity = '0';
    memoryState.element.style.transition = 'opacity 1s ease-out';

    setTimeout(() => {
        if (memoryState.element.parentNode) {
            memoryState.element.parentNode.removeChild(memoryState.element);
        }
    }, 1000);

    activeMemories.splice(index, 1);
};
