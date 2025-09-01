const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const digitUrls = Array.from({ length: 10 }, (_, i) => `/audio/${i}.wav`);
const noiseUrl = '/audio/noise.wav';
let digitBuffers = new Array(10);
let noiseBuffer = null;
let currentDigits = [];
let userInput = '';

// Correction values in dB for digits 0-9 (placeholder; replace with actual values)
const correctionValues = [-10.7, -14.2, -18.5, -12.4, -13.5, -15.1, -15.0, -15.4, -11.6, -12.0]; // e.g., [1.2, -0.5, 0.3, ...]

// Adaptive parameters
let currentSNR = 0; // Starting SNR in dB
let stepSize = 2; // 2 dB change per step
let numTrials = 24; // Total trials
let trialCount = 0;
let snrHistory = []; // Record SNR for each trial
let fixedNoiseGain = 1.0; // Default noise gain, set during calibration
let responseTimes = []; // Record response times
let correctResponseTimes = []; // Record correct response times

let calibrationNoiseSource = null;
let calibrationNoiseGain = null;

async function loadAudio() {
    try {
        // Load digit audio
        const digitPromises = digitUrls.map(url => fetch(url)
            .then(response => response.arrayBuffer())
            .then(arrayBuffer => audioContext.decodeAudioData(arrayBuffer)));
        const digitResults = await Promise.all(digitPromises);
        digitBuffers = digitResults.map(buffer => normalizeRMS(buffer));

        // Load and normalize noise audio
        const noiseResponse = await fetch(noiseUrl);
        const noiseArrayBuffer = await noiseResponse.arrayBuffer();
        noiseBuffer = await audioContext.decodeAudioData(noiseArrayBuffer);
        noiseBuffer = normalizeRMS(noiseBuffer);
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

// Calculate total power of digit signals (excluding silence)
function calculateDigitPower(digits) {
    let totalPower = 0;
    let totalLength = 0;

    digits.forEach(digit => {
        const correctedBuffer = applyCorrection(digitBuffers[digit], correctionValues[digit]);
        const channelData = correctedBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < channelData.length; i++) {
            sum += channelData[i] ** 2;
        }
        totalPower += sum;
        totalLength += channelData.length;
    });

    return totalPower / totalLength; // Average power per sample
}

// Play a triplet with noise and SNR based on digit signals only
function playTriplet(digits) {
    let totalDuration = 0;
    const segments = [];

    // Add 500ms silence at start
    const silence500 = createSilence(500);
    segments.push(silence500);
    totalDuration += silence500.length;

    let digitTotalLength = 0;
    digits.forEach((digit, index) => {
        // Apply correction to digit
        const correctedBuffer = applyCorrection(digitBuffers[digit], correctionValues[digit]);
        segments.push(correctedBuffer);
        totalDuration += correctedBuffer.length;
        digitTotalLength += correctedBuffer.length;

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

    // Calculate SNR-based gain for digits
    const digitPower = calculateDigitPower(digits); // Average power per sample
    const noiseSamplePower = noiseBuffer.getChannelData(0).reduce((sum, val) => sum + val * val, 0) / noiseBuffer.length; // Noise power per sample
    console.log('Digit Power (per sample):', digitPower, 'Noise Power (per sample):', noiseSamplePower);

    const snrLinear = Math.pow(10, currentSNR / 10); // Convert SNR to linear scale
    const digitGainValue = Math.sqrt(snrLinear * noiseSamplePower / digitPower) * fixedNoiseGain; // Adjust digit gain to achieve SNR
    console.log('Target SNR (dB):', currentSNR, 'Calculated Gain:', digitGainValue);

    if (digitGainValue <= 0) digitGainValue = 0.1; // Minimum gain to ensure audible

    // Play full sequence with noise
    const source = audioContext.createBufferSource();
    source.buffer = fullBuffer;
    const sourceGain = audioContext.createGain();
    sourceGain.gain.value = Math.max(0.1, digitGainValue); // Ensure minimum gain
    source.connect(sourceGain);
    sourceGain.connect(audioContext.destination);

    const noiseGain = audioContext.createGain();
    noiseGain.gain.value = fixedNoiseGain; // Use calibrated noise gain
    noiseSource.connect(noiseGain);
    noiseGain.connect(audioContext.destination);

    const startTime = audioContext.currentTime;
    source.start(startTime);
    noiseSource.start(startTime, 0, fullBuffer.duration);
    const endTime = startTime + (totalDuration / audioContext.sampleRate); // Noise ends with source

    // Disable input during playback
    document.querySelectorAll('.keypad-button').forEach(button => {
        button.disabled = true;
    });

    source.onended = () => {
        noiseSource.stop();
        // Enable input after playback
        document.querySelectorAll('.keypad-button').forEach(button => {
            button.disabled = false;
        });
        document.getElementById('progress').textContent = `Trial ${trialCount + 1} of 24`;
    };

    // Store end time for response time calculation
    window.currentTrialEndTime = endTime;
}

// Start calibration mode
function startCalibration() {
    if (calibrationNoiseSource) calibrationNoiseSource.stop();
    calibrationNoiseSource = audioContext.createBufferSource();
    calibrationNoiseSource.buffer = noiseBuffer;
    calibrationNoiseSource.loop = true;

    calibrationNoiseGain = audioContext.createGain();
    calibrationNoiseGain.gain.value = parseFloat(document.getElementById('volumeControl').value); // Initial gain from slider
    calibrationNoiseSource.connect(calibrationNoiseGain);
    calibrationNoiseGain.connect(audioContext.destination);

    calibrationNoiseSource.start(0);
    document.getElementById('calibrate').disabled = true;
    document.getElementById('volumeControl').disabled = false;
    document.getElementById('confirm').disabled = false;

    // Add real-time volume control
    document.getElementById('volumeControl').addEventListener('input', function() {
        if (calibrationNoiseGain) {
            calibrationNoiseGain.gain.value = parseFloat(this.value);
        }
    });
}

// Confirm calibration and set fixed noise gain
function confirmCalibration() {
    fixedNoiseGain = parseFloat(document.getElementById('volumeControl').value);
    if (calibrationNoiseSource) {
        calibrationNoiseSource.stop();
        calibrationNoiseSource = null;
    }
    if (calibrationNoiseGain) {
        calibrationNoiseGain.disconnect();
        calibrationNoiseGain = null;
    }
    document.getElementById('calibrate').disabled = false;
    document.getElementById('volumeControl').disabled = true;
    document.getElementById('confirm').disabled = true;
    document.getElementById('start').disabled = false; // Enable start after calibration
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
        document.getElementById('calibrate').addEventListener('click', startCalibration);
        document.getElementById('confirm').addEventListener('click', confirmCalibration);
        document.getElementById('start').addEventListener('click', () => {
            currentDigits = generateTriplet();
            playTriplet(currentDigits);
            userInput = '';
            document.getElementById('input').textContent = '';
            document.getElementById('result').textContent = '';
            document.getElementById('start').disabled = true;
            trialCount = 0; // Reset trial count
            snrHistory = []; // Reset SNR history
            responseTimes = []; // Reset response times
            correctResponseTimes = []; // Reset correct response times
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
                snrHistory.push(currentSNR); // Record current SNR
                const responseTime = (performance.now() / 1000) - (window.currentTrialEndTime || 0);
                if (responseTime >= 0) {
                    responseTimes.push(responseTime); // Record all response times
                    if (correct) correctResponseTimes.push(responseTime); // Record correct response times
                }
                if (correct) {
                    currentSNR -= stepSize; // Decrease SNR by 2 dB on correct
                } else {
                    currentSNR += stepSize; // Increase SNR by 2 dB on incorrect
                }
                trialCount++;
                document.getElementById('result').textContent = ''; // Remove correct/incorrect feedback
                document.getElementById('progress').textContent = `Trial ${trialCount} of 24`; // Update progress
                if (trialCount >= numTrials) {
                    calculateSRT(); // Calculate SRT after 24 trials
                } else {
                    setTimeout(() => {
                        currentDigits = generateTriplet();
                        playTriplet(currentDigits);
                        userInput = '';
                        document.getElementById('input').textContent = '';
                        document.getElementById('result').textContent = '';
                    }, 1000); // Delay 1 second for next trial
                }
            }
        });
    });
});

// Calculate and display SRT, then redirect to results page
function calculateSRT() {
    if (snrHistory.length >= 20) {
        const last20 = snrHistory.slice(-20);
        const srt = last20.reduce((sum, val) => sum + val, 0) / 20;
        const meanResponseTime = responseTimes.reduce((sum, val) => sum + val, 0) / responseTimes.length || 0;
        const meanCorrectResponseTime = correctResponseTimes.reduce((sum, val) => sum + val, 0) / correctResponseTimes.length || 0;

        // Store results in localStorage
        localStorage.setItem('testResults', JSON.stringify({
            srt: srt.toFixed(2),
            meanResponseTime: meanResponseTime.toFixed(2),
            meanCorrectResponseTime: meanCorrectResponseTime.toFixed(2)
        }));

        // Redirect to results page
        window.location.href = '/results.html';
    } else {
        document.getElementById('result').textContent = 'Not enough trials for SRT.';
    }
    document.getElementById('start').disabled = false; // Allow restart
}
