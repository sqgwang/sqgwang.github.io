const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const digitUrls = Array.from({ length: 10 }, (_, i) => `/audio/${i}.wav`);
const noiseUrl = '/audio/noise.wav';
let digitBuffers = new Array(10);
let noiseBuffer = null;
let currentDigits = [];

async function loadAudio() {
    try {
        // 加载数字音频
        const digitPromises = digitUrls.map(url => fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer)));
        digitBuffers = await Promise.all(digitPromises);

        // 加载噪声音频
        const noiseResponse = await fetch(noiseUrl);
        const noiseArrayBuffer = await noiseResponse.arrayBuffer();
        noiseBuffer = await audioContext.decodeAudioData(noiseArrayBuffer);
    } catch (error) {
        console.error('Error loading audio files:', error);
    }
}

function playAudio(digits) {
    const offlineContext = new OfflineAudioContext(2, 44100 * 3, 44100); // 3秒音频
    const gainNode = offlineContext.createGain();
    gainNode.connect(offlineContext.destination);
    gainNode.gain.value = 0.7; // 调整总体音量

    // 播放三个数字
    digits.forEach((digit, index) => {
        const source = offlineContext.createBufferSource();
        source.buffer = digitBuffers[digit];
        source.connect(gainNode);
        source.start(index * 0.8); // 每个数字间隔0.8秒
    });

    // 叠加噪声
    const noiseSource = offlineContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.connect(gainNode);
    noiseSource.start(0);
    noiseSource.stop(3); // 噪声持续3秒

    offlineContext.startRendering().then(renderedBuffer => {
        const playbackContext = new AudioContext();
        const playbackSource = playbackContext.createBufferSource();
        playbackSource.buffer = renderedBuffer;
        playbackSource.connect(playbackContext.destination);
        playbackSource.start();
    });
}

function startTest() {
    currentDigits = [];
    for (let i = 0; i < 3; i++) {
        currentDigits.push(Math.floor(Math.random() * 10));
    }
    playAudio(currentDigits);
    document.getElementById('input').textContent = '';
    document.getElementById('result').textContent = '';
    document.getElementById('start').disabled = true;
}

function updateInput(value) {
    let input = document.getElementById('input').textContent;
    if (input.length < 3) {
        document.getElementById('input').textContent += value;
    }
}

function clearInput() {
    document.getElementById('input').textContent = '';
}

function submitInput() {
    const userInput = document.getElementById('input').textContent.split('').map(Number);
    if (userInput.length === 3) {
        const correct = userInput.every((digit, index) => digit === currentDigits[index]);
        document.getElementById('result').textContent = correct ? 'Correct!' : 'Incorrect. Try again.';
        document.getElementById('start').disabled = false;
    } else {
        document.getElementById('result').textContent = 'Please enter 3 digits.';
    }
}

// 事件监听
document.addEventListener('DOMContentLoaded', () => {
    loadAudio().then(() => {
        document.getElementById('start').addEventListener('click', startTest);
        document.querySelectorAll('.keypad-button:not(#clear):not(#submit)').forEach(button => {
            button.addEventListener('click', () => updateInput(button.textContent));
        });
        document.getElementById('clear').addEventListener('click', clearInput);
        document.getElementById('submit').addEventListener('click', submitInput);
    });
});
