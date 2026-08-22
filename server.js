import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';


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

// Menu JSON endpoint (representing future restaurant app integration)
app.get('/api/menu', async (req, res) => {
  try {
    const menuData = await fs.readFile(path.join(__dirname, 'menu.json'), 'utf8');
    res.json(JSON.parse(menuData));
  } catch (error) {
    console.error('Error reading menu.json:', error);
    res.status(500).json({ error: 'Failed to load menu items' });
  }
});

// Mock OpenNDS captive portal authentication gateway
app.get('/opennds_auth', (req, res) => {
  const { tok, redir } = req.query;
  console.log(`[Captive Portal] Client token ${tok} authorized. Redirecting to ${redir || '/'}`);
  
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Wi-Fi Connected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            background-color: #FAF8F5;
            color: #2C1A11;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .card {
            background: #FFFFFF;
            border: 1px solid rgba(44, 26, 17, 0.08);
            padding: 2.5rem 2rem;
            border-radius: 24px;
            box-shadow: 0 12px 30px rgba(44, 26, 17, 0.08);
            max-width: 400px;
          }
          .spinner {
            border: 3px solid rgba(44, 26, 17, 0.05);
            border-top: 3px solid #2D6A4F;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 1.5rem auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          h1 { color: #2D6A4F; margin-top: 0; font-size: 24px; font-weight: 800; }
          p { color: #5C4E46; font-size: 14px; line-height: 1.5; }
        </style>
        <script>
          setTimeout(() => {
            window.location.href = "${redir || '/'}";
          }, 3000);
        </script>
      </head>
      <body>
        <div class="card">
          <h1>🔒 Wi-Fi Connected</h1>
          <p>Your device is now authenticated on the Restaurant Guest Network.</p>
          <div class="spinner"></div>
          <p>Redirecting you to your destination...</p>
        </div>
      </body>
    </html>
  `);
});

// Fallback to index.html for React routing in production
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`  Synapse Cuisine Backend running on port ${PORT}`);
  console.log(`  WebSocket Server ready for client connections`);
  console.log(`==================================================`);
});
