const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });
const rooms = new Map(); // Stores PIN -> { host: ws, hostIp: string, clients: Set of ws }

wss.on('connection', (ws, req) => { // Added 'req' here to access headers
    console.log('A client connected!');
    let currentRoomPin = null;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'host') {
                currentRoomPin = data.pin;
                
                // Extract the real IP, checking Render's proxy header first
                const forwarded = req.headers['x-forwarded-for'];
                const hostIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

                rooms.set(currentRoomPin, { host: ws, hostIp: hostIp, clients: new Set() });
                console.log(`Room hosted successfully with PIN: ${currentRoomPin} | Host IP: ${hostIp}`);
                ws.send(JSON.stringify({ status: "hosted_success" }));
            } 
            else if (data.type === 'join') {
                currentRoomPin = data.pin;
                if (rooms.has(currentRoomPin)) {
                    const room = rooms.get(currentRoomPin);
                    room.clients.add(ws);
                    console.log(`Client successfully joined room PIN: ${currentRoomPin}`);
                    
                    // Send join_success AND pass the real host_ip to the client
                    ws.send(JSON.stringify({ 
                        status: "join_success", 
                        host_ip: room.hostIp 
                    }));
                    
                    if (room.host.readyState === WebSocket.OPEN) {
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