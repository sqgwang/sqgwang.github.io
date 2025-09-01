const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const digitUrls = Array.from({ length: 10 }, (_, i) => `/audio/${i}.wav`);
const noiseUrl = '/audio/noise.wav';
let digitBuffers = new Array(10);
let noiseBuffer = null;
let currentDigits = [];
let userInput = '';

// Correction values in dB for digits 0-9 (placeholder; replace with actual values)
const correctionValues = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // e.g., [1.2, -0.5, 0.3, ...]

// Adaptive parameters
let currentSNR = 0; // Starting SNR in dB, adjustable
let stepSize = 2; // dB change per step
let numTrials = 24; // Total trials
let trialCount = 0;
let snrHistory = []; // Record SNR for each trial

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

// Normalize RMS of a buffer to a target level (e.g., -20 dBFS equivalent)
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
    const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
    return buffer;
}

// Play a triplet with noise throughout, at given SNR
function playTriplet(digits, snr) {
    let totalDuration = 0;
    const segments = [];

    // Add 500ms silence at start
    const silence500Start = createSilence(500);
    segments.push(silence500Start);
    totalDuration += silence500Start.length;

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

    // Concatenate segments into one buffer for speech
    const speechBuffer = audioContext.createBuffer(1, totalDuration, audioContext.sampleRate);
    let offset = 0;
    segments.forEach(seg => {
        speechBuffer.copyToChannel(seg.getChannelData(0), 0, offset);
        offset += seg.length;
    });

    // Play speech with SNR adjustment
    const speechSource = audioContext.createBufferSource();
    speechSource.buffer = speechBuffer;
    const speechGain = audioContext.createGain();
    speechGain.gain.value = Math.pow(10, snr / 20); // Apply SNR
    speechSource.connect(speechGain);
    speechGain.connect(audioContext.destination);

    // Play noise throughout
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true; // Loop if noise is shorter
    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = 1; // Noise at reference level
    noiseSource.connect(noiseGain);
    noiseGain.connect(audioContext.destination);

    const startTime = audioContext.currentTime;
    speechSource.start(startTime);
    noiseSource.start(startTime, 0, speechBuffer.duration / audioContext.sampleRate);
    speechSource.onended = () => noiseSource.stop();
}

function generateTriplet() {
    const digits = new Set();
    while (digits.size < 3) {
        digits.add(Math.floor(Math.random() * 10));
    }
    return Array.from(digits);
}

function startNextTrial() {
    currentDigits = generateTriplet();
    playTriplet(currentDigits, currentSNR);
    userInput = '';
    document.getElementById('input').textContent = '';
    document.getElementById('result').textContent = '';
}

// Calculate and display SRT
function calculateSRT() {
    if (snrHistory.length >= 20) {
        const last20 = snrHistory.slice(-20);
        const srt = last20.reduce((sum, val) => sum + val, 0) / 20;
        document.getElementById('result').textContent = `Test complete. SRT: ${srt.toFixed(2)} dB`;
    } else {
        document.getElementById('result').textContent = 'Not enough trials for SRT.';
    }
    document.getElementById('start').disabled = false; // Allow restart
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadAudio().then(() => {
        document.getElementById('start').addEventListener('click', () => {
            currentSNR = 0; // Reset or adjustable
            trialCount = 0;
            snrHistory = [];
            document.getElementById('start').disabled = true;
            startNextTrial();
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
                snrHistory.push(currentSNR);
                if (correct) {
                    currentSNR -= stepSize; // One down: make harder
                } else {
                    currentSNR += stepSize; // One up: make easier
                }
                trialCount++;
                document.getElementById('result').textContent = correct ? 'Correct!' : 'Incorrect.';
                if (trialCount >= numTrials) {
                    calculateSRT();
                } else {
                    setTimeout(startNextTrial, 1000); // Delay for next trial
                }
            }
        });
    });
});
