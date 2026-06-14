// Detect if running on GitHub Pages (HTTPS) or local test files
const isSecure = window.location.protocol === 'https:';
const serverHost = isSecure ? 'wss://my-party-relay-server.onrender.com' : 'ws://localhost:10000';

let socket = null;
let clientId = "";

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const gamepadScreen = document.getElementById('gamepad-screen');
const roomInput = document.getElementById('room-input');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const leaveBtn = document.getElementById('leave-btn');
const errorDisplay = document.getElementById('error-display');
const playerDisplay = document.getElementById('player-display');

// Elements for the controllers
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const btnActionA = document.getElementById('btn-action-a');

// Generate or retrieve a persistent client ID
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
    
    // Replace address with your Render URL if hosted
    socket = new WebSocket(serverHost);

    socket.onopen = () => {
        // Send join packet
        const joinPayload = {
            action: 'join',
            room: roomCode,
            clientId: nickname // Using nickname as the ID identifier in Godot
        };
        socket.send(JSON.stringify(joinPayload));
    };

    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'join_success') {
            // Swap screens
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

// Send real-time interactions to the Godot Host
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

// Set up mobile action listeners
btnLeft.addEventListener('pointerdown', () => sendInputToHost('left'));
btnRight.addEventListener('pointerdown', () => sendInputToHost('right'));
btnActionA.addEventListener('pointerdown', () => sendInputToHost('action_a'));

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
    if (socket) socket = null;
}
