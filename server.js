const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });
const rooms = new Map(); // Stores PIN -> { host: ws, clients: Set of ws }

wss.on('connection', (ws) => {
    console.log('A client connected!');
    let currentRoomPin = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'host') {
                currentRoomPin = data.pin;
                rooms.set(currentRoomPin, { host: ws, clients: new Set() });
                console.log(`Room hosted successfully with PIN: ${currentRoomPin}`);
                ws.send(JSON.stringify({ status: "hosted_success" }));
            } 
            else if (data.type === 'join') {
                currentRoomPin = data.pin;
                if (rooms.has(currentRoomPin)) {
                    rooms.get(currentRoomPin).clients.add(ws);
                    console.log(`Client successfully joined room PIN: ${currentRoomPin}`);
                    ws.send(JSON.stringify({ status: "join_success" }));
                    
                    const room = rooms.get(currentRoomPin);
                    if (room && room.host.readyState === WebSocket.OPEN) {
                        room.host.send(JSON.stringify({ status: "player_joined" }));
                    }
                } else {
                    console.log(`Room not found for PIN: ${data.pin}`);
                    ws.send(JSON.stringify({ status: "room_not_found" }));
                }
            }
            else if (data.type === 'packet') {
                if (currentRoomPin && rooms.has(currentRoomPin)) {
                    const room = rooms.get(currentRoomPin);
                    if (ws === room.host) {
                        room.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) client.send(message);
                        });
                    } else {
                        if (room.host.readyState === WebSocket.OPEN) {
                            room.host.send(message);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Error parsing incoming message:', e);
        }
    });

    ws.on('close', () => {
        console.log('A client disconnected.');
        if (currentRoomPin && rooms.has(currentRoomPin)) {
            const room = rooms.get(currentRoomPin);
            if (room.host === ws) {
                rooms.delete(currentRoomPin);
                console.log(`Host left. Closed and removed room PIN: ${currentRoomPin}`);
            } else {
                room.clients.delete(ws);
            }
        }
    });
});

console.log(`WebSocket relay server is running on port ${PORT}`);