const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('CR Drive WebSocket Relay is active.\n');
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

wss.on('connection', (ws, req) => {
    console.log('A client connected.');
    let currentRoomPin = null;

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() : req.socket.remoteAddress;

    ws.on('message', (message) => {
        try {
            const messageStr = message.toString();
            const data = JSON.parse(messageStr);

            if (data.type === 'host') {
                currentRoomPin = data.pin;
                rooms.set(currentRoomPin, { host: ws, hostIp: clientIp, clients: new Set() });
                console.log(`[ROOM HOSTED] PIN: ${currentRoomPin} | Host IP: ${clientIp}`);
                ws.send(JSON.stringify({ status: "hosted_success" }));
            } 
            else if (data.type === 'join') {
                currentRoomPin = data.pin;
                if (rooms.has(currentRoomPin)) {
                    const room = rooms.get(currentRoomPin);
                    room.clients.add(ws);
                    console.log(`[CLIENT JOINED] Room PIN: ${currentRoomPin}`);
                    
                    ws.send(JSON.stringify({ 
                        status: "join_success", 
                        host_ip: room.hostIp 
                    }));
                    
                    if (room.host && room.host.readyState === WebSocket.OPEN) {
                        room.host.send(JSON.stringify({ status: "player_joined" }));
                    }
                } else {
                    console.log(`[ROOM NOT FOUND] PIN: ${data.pin}`);
                    ws.send(JSON.stringify({ status: "room_not_found" }));
                }
            }
            else if (data.type === 'packet') {
                if (currentRoomPin && rooms.has(currentRoomPin)) {
                    const room = rooms.get(currentRoomPin);

                    if (ws !== room.host && room.host && room.host.readyState === WebSocket.OPEN) {
                        room.host.send(messageStr);
                    }

                    room.clients.forEach(client => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(messageStr);
                        }
                    });
                } else {
                    console.log(`[PACKET DROPPED] Unbound or non-existent room PIN: ${currentRoomPin}`);
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
                room.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ status: "host_disconnected" }));
                    }
                });
                rooms.delete(currentRoomPin);
                console.log(`[ROOM CLOSED] Host left. Removed room PIN: ${currentRoomPin}`);
            } else {
                room.clients.delete(ws);
                console.log(`[CLIENT LEFT] Removed from room PIN: ${currentRoomPin}`);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`WebSocket relay server is running on port ${PORT}`);
});