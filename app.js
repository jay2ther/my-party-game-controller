let ws;
let mySessionName = "";
let myRoomCode = "";
let autoReconnectInterval;
let clientTimerInterval; // 🔥 Keeps track of the local phone countdown loop

// ⚠️ SWAP THIS LINK WITH YOUR LIVE RENDER SUBDOMAIN CAPTURED IN PHASE 1
const CLOUD_URL = "wss://my-party-relay-server.onrender.com"; 

function connectToRelayNetwork() {
    ws = new WebSocket(CLOUD_URL);

    ws.onopen = () => {
        console.log("Channel handshake verified with Render.");
        document.getElementById('disconnectAlert').style.display = 'none';
        clearInterval(autoReconnectInterval);

        // Session recovery configuration
        if (mySessionName && myRoomCode) {
            ws.send(JSON.stringify({ action: "join_room", room_code: myRoomCode, name: mySessionName }));
        }
    };

    ws.onmessage = (event) => {
        let serverData;
        try { serverData = JSON.parse(event.data); } catch (e) { return; }

        // If the message came from the Godot host, unwrap the inner payload
        let data = serverData;
        if (serverData.action === "update_client" && serverData.payload) {
            data = serverData.payload;
        }

        // Router branch 1: Initial user profile mapping
        if (data.action === "profile_loaded") {
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('universalHUD').style.display = 'flex';
            document.getElementById('hudPlayerName').innerText = mySessionName.toUpperCase();
            document.getElementById('hudStatValue').innerText = "Score: " + (data.currency || 0);
            
            renderBlankCanvas({
                type: "waiting",
                prompt: "Welcome to the Lobby!",
                message: "Waiting for the Host to launch a game..."
            });
        }
        
        // Router branch 2: Catch standard balance adjustments from Godot
        else if (data.action === "update_bank") {
            document.getElementById('hudStatValue').innerText = "Score: " + data.currency;
        }

        // Router branch 3: THE CORE INJECTOR
        else if (data.action === "update_layout") {
            renderBlankCanvas(data.payload);
        }
    };

    ws.onclose = () => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('universalHUD').style.display = 'none';
        document.getElementById('dynamicCanvas').innerHTML = "";
        document.getElementById('disconnectAlert').style.display = 'block';
        clearInterval(clientTimerInterval);
        
        clearInterval(autoReconnectInterval);
        autoReconnectInterval = setTimeout(connectToRelayNetwork, 3000);
    };
}

// UNIVERSAL LAYOUT GENERATION INTERPRETER
function renderBlankCanvas(payload) {
    const canvas = document.getElementById('dynamicCanvas');
    if (!canvas) return;
    
    // 🔥 ALWAYS wipe out old running timers the millisecond a layout swaps
    canvas.innerHTML = ""; 
    clearInterval(clientTimerInterval);
    
    if (!payload) return;

    // 1. Structural Headline Prompt Header Injection
    if (payload.prompt) {
        const headerText = document.createElement('div');
        headerText.className = "layout-prompt";
        headerText.innerText = payload.prompt;
        canvas.appendChild(headerText);
    }

    // 🔥 2. DYNAMIC TIMER INJECTION MODULE
    if (payload.time_limit && payload.time_limit > 0) {
        let timeLeft = payload.time_limit;
        
        const timerVisualEl = document.createElement('div');
        timerVisualEl.style.fontSize = "26px";
        timerVisualEl.style.fontWeight = "bold";
        timerVisualEl.style.color = "#ff3d00"; // Alarm Red
        timerVisualEl.style.margin = "10px 0 25px 0";
        timerVisualEl.innerText = "⏱️ " + timeLeft + "s REMAINING";
        canvas.appendChild(timerVisualEl);
        
        // Run a local isolated secondary loop down on the phone hardware thread
        clientTimerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                timerVisualEl.innerText = "⏱️ HATCH CLOSING!";
                clearInterval(clientTimerInterval);
            } else {
                timerVisualEl.innerText = "⏱️ " + timeLeft + "s REMAINING";
            }
        }, 1000);
    }

    // 3. Element Processing Branch
    switch (payload.type) {
        case "waiting":
            const statusEl = document.createElement('p');
            statusEl.style.color = "#888";
            statusEl.style.fontSize = "18px";
            statusEl.innerText = payload.message || "Please focus on the main screen...";
            canvas.appendChild(statusEl);
            break;

        case "text_input":
            const inputEl = document.createElement('input');
            inputEl.type = "text";
            inputEl.id = "canvasTextInputField";
            inputEl.placeholder = payload.placeholder || "Type your entry here...";
            canvas.appendChild(inputEl);

            const submitBtn = document.createElement('button');
            submitBtn.innerText = payload.button_text || "SUBMIT";
            submitBtn.onclick = () => {
                const textValue = document.getElementById('canvasTextInputField').value;
                if (!textValue.trim()) return;
                
                sendInputPayload({ value: textValue });
                renderBlankCanvas({ type: "waiting", prompt: "Entry Logged!", message: "Waiting for other players to submit..." });
            };
            canvas.appendChild(submitBtn);
            break;

        case "choices":
            if (payload.options && Array.isArray(payload.options)) {
                payload.options.forEach((choiceString) => {
                    const choiceBtn = document.createElement('button');
                    choiceBtn.innerText = choiceString;
                    choiceBtn.onclick = () => {
                        sendInputPayload({ selection: choiceString });
                        renderBlankCanvas({ type: "waiting", prompt: "Selection Recorded", message: "Locked in! Keep your eyes on the TV." });
                    };
                    canvas.appendChild(choiceBtn);
                });
            }
            break;
    }
}

function joinRoomAction() {
    const nameVal = document.getElementById('playerName').value.trim();
    const codeVal = document.getElementById('roomCode').value.trim().toUpperCase();

    if (!nameVal || !codeVal) { alert("Please enter both a name and room code!"); return; }

    mySessionName = nameVal;
    myRoomCode = codeVal;
    
    connectToRelayNetwork();
}

function sendInputPayload(customObject) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
            action: "player_input",
            payload: customObject
        }));
    }
}
