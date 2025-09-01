const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const digitUrls = Array.from({ length: 10 }, (_, i) => `/audio/${i}.wav`);
const noiseUrl = '/audio/noise.wav';
let digitBuffers = new Array(10);
let noiseBuffer = null;
let currentDigits = [];
let userInput = '';

// Correction values in dB for digits 0-9 (placeholder; replace with actual values provided later)
const correctionValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // e.g., [1.2, -0.5, 0.3, ...]

async function loadAudio() {
    try {
        // Load digit audio
        const digitPromises = digitUrls.map(url => fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer)));
        digitBuffers = await Promise.all(digitPromises);

        // Normalize RMS for all digits to consistent level
        digitBuffers = digitBuffers.map(buffer => normalizeRMS(buffer));

        // Load noise audio
        const noiseResponse = await fetch(noiseUrl);
        const noiseArrayBuffer = await noiseResponse.arrayBuffer();
        noiseBuffer = await audioContext.decodeAudioData(noiseArrayBuffer);
    } catch (error) {
        console.error('Error loading audio files:', error);
    }
}

// Normalize RMS of a buffer to a target level (e.g., -20 dBFS)
function normalizeRMS(buffer, targetRMS = 0.1) {
    const channelData = buffer.getChannelData(0); // Assuming mono
    let sum = 0;
    for (let i = 0; i < channelData.length; i++) {
        sum += channelData[i] ** 2;
    }
    const rms = Math.sqrt(sum / channelData.length);
    const gain = targetRMS / rms;

    const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        const newData = newBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            newData[i] = data[i] * gain;
        }
    }
    return newBuffer;
}

// Apply correction value to a digit buffer (in dB)
function applyCorrection(buffer, dbCorrection) {
    const gain = Math.pow(10, dbCorrection / 20);
    const newBuffer = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        const data = buffer.getChannelData(ch);
        const newData = newBuffer.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            newData[i] = data[i] * gain;
        }
    }
    return newBuffer;
}

// Generate silence buffer
function createSilence(durationMs) {
    const length = (durationMs / 1000) * audioContext.sampleRate;
    return audioContext.createBuffer(1, length, audioContext.sampleRate);
}

// Play a triplet with noise and corrections
function playTriplet(digits) {
    let totalDuration = 0;
    const segments = [];

    // Add 500ms silence at start
    const silence500 = createSilence(500);
    segments.push(silence500);
    totalDuration += silence500.length;

    digits.forEach((digit, index) => {
        // Apply correction to digit
        const correctedBuffer = applyCorrection(digitBuffers[digit], correctionValues[digit]);
        segments.push(correctedBuffer);
        totalDuration += correctedBuffer.length;

        // Add 200ms silence between digits (except after last)
        if (index < digits.length - 1) {
            const silence200 = createSilence(200);
            segments.push(silence200);
            totalDuration += silence200.length;
        }
    });

    // Add 500ms silence at end
    const silence500End = createSilence(500);
    segments.push(silence500End);
    totalDuration += silence500End.length;

    // Concatenate segments into one buffer
    const fullBuffer = audioContext.createBuffer(1, totalDuration, audioContext.sampleRate);
    let offset = 0;
    segments.forEach(seg => {
        fullBuffer.copyToChannel(seg.getChannelData(0), 0, offset);
        offset += seg.length;
    });

    // Create noise for full duration
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true; // Loop if noise is shorter

    // Play full sequence with noise
    const source = audioContext.createBufferSource();
    source.buffer = fullBuffer;
    const noiseGain = audioContext.createGain(); // Adjust SNR if needed
    noiseGain.gain.value = 1; // Placeholder; implement SNR calculation separately

    source.connect(audioContext.destination);
    noiseSource.connect(noiseGain);
    noiseGain.connect(audioContext.destination);

    const startTime = audioContext.currentTime;
    source.start(startTime);
    noiseSource.start(startTime, 0, fullBuffer.duration);
    source.onended = () => noiseSource.stop();
}

function generateTriplet() {
    const digits = new Set();
    while (digits.size < 3) {
        digits.add(Math.floor(Math.random() * 10));
    }
    return Array.from(digits);
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAudio().then(() => {
        document.getElementById('start').addEventListener('click', () => {
            currentDigits = generateTriplet();
            playTriplet(currentDigits);
            userInput = '';
            document.getElementById('input').textContent = '';
            document.getElementById('result').textContent = '';
            document.getElementById('start').disabled = true;
        });

        document.querySelectorAll('.keypad-button:not(#clear):not(#submit)').forEach(button => {
            button.addEventListener('click', () => {
                if (userInput.length < 3) {
                    userInput += button.textContent;
                    document.getElementById('input').textContent = userInput;
                }
            });
        });

        document.getElementById('clear').addEventListener('click', () => {
            userInput = '';
            document.getElementById('input').textContent = '';
        });

        document.getElementById('submit').addEventListener('click', () => {
            if (userInput.length === 3) {
                const inputDigits = userInput.split('').map(Number);
                const correct = inputDigits.every((d, i) => d === currentDigits[i]);
                document.getElementById('result').textContent = correct ? 'Correct!' : 'Incorrect. Try again.';
                document.getElementById('start').disabled = false;
            }
        });
    });
});
