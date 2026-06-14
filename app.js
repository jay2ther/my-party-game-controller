const isSecure = window.location.protocol === 'https:';
const serverHost = isSecure ? 'wss://your-render-app-url.onrender.com' : 'ws://localhost:10000'; // Make sure to use your actual Render subdomain

let socket = null;
let clientId = "";
let useGyro = false;
let lastTiltState = 0; // -1 = left, 1 = right, 0 = neutral

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const gamepadScreen = document.getElementById('gamepad-screen');
const roomInput = document.getElementById('room-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const errorDisplay = document.getElementById('error-display');
const playerDisplay = document.getElementById('player-display');

// Gamepad controls
const gamepadButtons = document.getElementById('gamepad-buttons');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnActionA = document.getElementById('btn-action-a');
const btnGyro = document.getElementById('btn-gyro');
const tiltInstructions = document.getElementById('tilt-instructions');

function getClientId() {
    let id = localStorage.getItem('party_game_client_id');
    if (!id) {
        id = 'player_' + Math.random().toString(36).substring(2, 9);
        localStorage.setItem('party_game_client_id', id);
    }
    return id;
}

clientId = getClientId();

joinBtn.addEventListener('click', () => {
    const roomCode = roomInput.value.trim().toUpperCase();
    const nickname = nameInput.value.trim();

    if (roomCode.length !== 4) {
        showError("Room code must be 4 letters.");
        return;
    }
    if (nickname.length === 0) {
        showError("Please enter a name.");
        return;
    }

    connectToRoom(roomCode, nickname);
});

function connectToRoom(roomCode, nickname) {
    showError("Connecting...");
    socket = new WebSocket(serverHost);

    socket.onopen = () => {
        const joinPayload = {
            action: 'join',
            room: roomCode,
            clientId: nickname
        };
        socket.send(JSON.stringify(joinPayload));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'join_success') {
            joinScreen.classList.remove('active');
            gamepadScreen.classList.add('active');
            playerDisplay.textContent = `Connected as: ${nickname}`;
            errorDisplay.textContent = "";
        } 
        else if (data.type === 'error') {
            showError(data.message);
            socket.close();
        } 
        else if (data.type === 'room_closed') {
            alert("The host closed the room.");
            resetUI();
        }
    };

    socket.onclose = () => {
        resetUI();
    };

    socket.onerror = (err) => {
        console.error("Socket error", err);
        showError("Failed to connect to server.");
    };
}

function sendInputToHost(actionName) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = {
            action: 'to_host',
            payload: {
                input: actionName
            }
        };
        socket.send(JSON.stringify(payload));
    }
}

// Button Touch Listeners (for manual mode)
btnLeft.addEventListener('pointerdown', () => { if(!useGyro) sendInputToHost('left_down'); });
btnLeft.addEventListener('pointerup', () => { if(!useGyro) sendInputToHost('left_up'); });
btnLeft.addEventListener('pointerleave', () => { if(!useGyro) sendInputToHost('left_up'); });

btnRight.addEventListener('pointerdown', () => { if(!useGyro) sendInputToHost('right_down'); });
btnRight.addEventListener('pointerup', () => { if(!useGyro) sendInputToHost('right_up'); });
btnRight.addEventListener('pointerleave', () => { if(!useGyro) sendInputToHost('right_up'); });

// Action Button (remains active in both modes)
btnActionA.addEventListener('pointerdown', () => sendInputToHost('action_a'));

// Gyroscope / Sensor Permissions Toggle
btnGyro.addEventListener('click', async () => {
    if (useGyro) {
        disableGyroscope();
        return;
    }

    // Modern Safari / iOS requires explicit user interaction to trigger permission request
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permissionState = await DeviceOrientationEvent.requestPermission();
            if (permissionState === 'granted') {
                enableGyroscope();
            } else {
                alert("Permission to access gyroscope was denied.");
            }
        } catch (error) {
            console.error("Gyroscope permission error:", error);
            alert("Could not request gyroscope permissions on this browser.");
        }
    } else {
        // Android or non-iOS browsers usually do not require permission requests
        enableGyroscope();
    }
});

function enableGyroscope() {
    useGyro = true;
    btnGyro.textContent = "DISABLE TILT CONTROL";
    btnGyro.style.backgroundColor = "#2ecc71"; // Turn Green
    btnGyro.style.boxShadow = "0 4px #27ae60";
    
    // Hide manual left/right buttons, leave ACTION span wide
    btnLeft.style.display = 'none';
    btnRight.style.display = 'none';
    tiltInstructions.style.display = 'block';
    
    // Listen to tilt events
    window.addEventListener('deviceorientation', handleOrientation);
}

function disableGyroscope() {
    useGyro = false;
    btnGyro.textContent = "ENABLE TILT CONTROL";
    btnGyro.style.backgroundColor = "#fbc531"; // Turn back to Yellow
    btnGyro.style.boxShadow = "0 4px #e1b12c";
    
    btnLeft.style.display = 'block';
    btnRight.style.display = 'block';
    tiltInstructions.style.display = 'none';
    
    // Clean up orientation event
    window.removeEventListener('deviceorientation', handleOrientation);
    
    // Safety check: ensure character stops moving on mode switch
    if (lastTiltState !== 0) {
        if (lastTiltState === -1) sendInputToHost('left_up');
        if (lastTiltState === 1) sendInputToHost('right_up');
        lastTiltState = 0;
    }
}

function handleOrientation(event) {
    if (!useGyro) return;
    
    // event.gamma is left-to-right tilt in degrees, from -90 to 90
    const gamma = event.gamma;
    if (gamma === null) return;
    
    let currentTiltState = 0;
    
    // Threshold set to 12 degrees tilt to avoid minor hand jitters
    if (gamma < -12) {
        currentTiltState = -1; // Tilted Left
    } else if (gamma > 12) {
        currentTiltState = 1;  // Tilted Right
    } else {
        currentTiltState = 0;  // Flat / Neutral
    }
    
    // ONLY send network messages on state change to avoid flooding the websocket!
    if (currentTiltState !== lastTiltState) {
        if (currentTiltState === -1) {
            sendInputToHost('left_down');
            if (lastTiltState === 1) sendInputToHost('right_up'); // Safety clean-up
        } else if (currentTiltState === 1) {
            sendInputToHost('right_down');
            if (lastTiltState === -1) sendInputToHost('left_up'); // Safety clean-up
        } else {
            // Returned to flat neutral, cancel any movement
            if (lastTiltState === -1) sendInputToHost('left_up');
            if (lastTiltState === 1) sendInputToHost('right_up');
        }
        lastTiltState = currentTiltState;
    }
}

leaveBtn.addEventListener('click', () => {
    if (socket) {
        socket.close();
    }
    resetUI();
});

function showError(msg) {
    errorDisplay.textContent = msg;
}

function resetUI() {
    joinScreen.classList.add('active');
    gamepadScreen.classList.remove('active');
    disableGyroscope();
    if (socket) socket = null;
}
