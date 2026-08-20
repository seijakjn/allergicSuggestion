import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for development
app.use(cors());

// Serve static assets in production
app.use(express.static(path.join(__dirname, 'dist')));

const server = createServer(app);

// Initialize Socket.io with permissive CORS for local dev environment
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] User connected: ${socket.id}`);

  // Device joins a session room based on kioskId
  socket.on('join-session', ({ kioskId, role }) => {
    socket.join(kioskId);
    socket.kioskId = kioskId;
    socket.role = role;
    console.log(`[Socket] Client ${socket.id} (${role}) joined room: ${kioskId}`);
  });

  // Mobile device projects allergen and preference data
  socket.on('project-preferences', ({ kioskId, allergens, preferences }) => {
    console.log(`[Socket] Projection received for Room ${kioskId}:`, { allergens, preferences });
    
    // Broadcast data to all other clients in the room (specifically the Kiosk)
    socket.to(kioskId).emit('preferences-projected', {
      allergens,
      preferences,
      timestamp: new Date().toISOString()
    });
  });

  // Mobile device places an order
  socket.on('place-order', ({ kioskId, item }) => {
    console.log(`[Socket] Order placed in Room ${kioskId}:`, item);
    
    // Broadcast order completion to all other clients in the room
    socket.to(kioskId).emit('order-placed', {
      item,
      timestamp: new Date().toISOString()
    });
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket] User disconnected: ${socket.id}`);
    if (socket.role === 'mobile' && socket.kioskId) {
      console.log(`[Socket] Mobile client disconnected from Kiosk ${socket.kioskId}. Notifying Kiosk.`);
      socket.to(socket.kioskId).emit('mobile-disconnected');
    }
  });
});

// Fallback to index.html for React routing in production
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  Synapse Cuisine Backend running on port ${PORT}`);
  console.log(`  WebSocket Server ready for client connections`);
  console.log(`==================================================`);
});
