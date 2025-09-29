// Simple backend API for Thinking of You app
// Can be deployed to Fly.io, Vercel, or any Node.js hosting

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// In-memory storage (use Redis or a database for production)
// Structure: { linkCode: { name1: "Alice", name2: "Bob", pendingPings: [] } }
const connections = {};

// Clean up old pings every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(connections).forEach(linkCode => {
    if (connections[linkCode].pendingPings) {
      connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(
        ping => now - ping.timestamp < 60000 // Keep pings for 1 minute
      );
    }
  });
}, 300000);

// Register a device with a link code
app.post('/api/register', (req, res) => {
  const { linkCode, name } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  // Initialize connection if it doesn't exist
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      name2: null,
      pendingPings: []
    };
  } else if (!connections[linkCode].name2 && connections[linkCode].name1 !== name) {
    // Second person joining
    connections[linkCode].name2 = name;
  } else if (connections[linkCode].name1 === name || connections[linkCode].name2 === name) {
    // Re-registering existing user
    console.log(`User ${name} re-registered for ${linkCode}`);
  }
  
  console.log(`Registered: ${name} with code ${linkCode}`);
  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null
  });
});

// Send a ping
app.post('/api/ping', (req, res) => {
  const { linkCode, senderName } = req.body;
  
  if (!linkCode || !senderName) {
    return res.status(400).json({ error: 'Link code and sender name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  // Add ping to pending pings
  connections[linkCode].pendingPings.push({
    senderName: senderName,
    timestamp: Date.now()
  });
  
  console.log(`Ping sent from ${senderName} on ${linkCode}`);
  res.json({ success: true });
});

// Check for incoming pings
app.get('/api/check', (req, res) => {
  const { linkCode } = req.query;
  
  if (!linkCode) {
    return res.status(400).json({ error: 'Link code is required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ hasPing: false });
  }
  
  // Check if there are any pending pings
  const hasPing = connections[linkCode].pendingPings.length > 0;
  
  if (hasPing) {
    // Clear the pings after delivering
    connections[linkCode].pendingPings = [];
  }
  
  res.json({ hasPing });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeConnections: Object.keys(connections).length
  });
});

// For local development
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Thinking of You API running on port ${PORT}`);
});

// For serverless deployment (Vercel/Netlify)
module.exports = app;// Simple backend API for Thinking of You app
// Can be deployed to Fly.io, Vercel, or any Node.js hosting

const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// In-memory storage (use Redis or a database for production)
// Structure: { linkCode: { name1: "Alice", name2: "Bob", pendingPings: [] } }
const connections = {};

// Clean up old pings every 5 minutes
setInterval(() => {
  const now = Date.now();
  Object.keys(connections).forEach(linkCode => {
    if (connections[linkCode].pendingPings) {
      connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(
        ping => now - ping.timestamp < 60000 // Keep pings for 1 minute
      );
    }
  });
}, 300000);

// Register a device with a link code
app.post('/api/register', (req, res) => {
  const { linkCode, name } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  // Initialize connection if it doesn't exist
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      name2: null,
      pendingPings: []
    };
  } else if (!connections[linkCode].name2 && connections[linkCode].name1 !== name) {
    // Second person joining
    connections[linkCode].name2 = name;
  } else if (connections[linkCode].name1 === name || connections[linkCode].name2 === name) {
    // Re-registering existing user
    console.log(`User ${name} re-registered for ${linkCode}`);
  }
  
  console.log(`Registered: ${name} with code ${linkCode}`);
  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null
  });
});

// Send a ping
app.post('/api/ping', (req, res) => {
  const { linkCode, senderName } = req.body;
  
  if (!linkCode || !senderName) {
    return res.status(400).json({ error: 'Link code and sender name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  // Add ping to pending pings
  connections[linkCode].pendingPings.push({
    senderName: senderName,
    timestamp: Date.now()
  });
  
  console.log(`Ping sent from ${senderName} on ${linkCode}`);
  res.json({ success: true });
});

// Check for incoming pings
app.get('/api/check', (req, res) => {
  const { linkCode } = req.query;
  
  if (!linkCode) {
    return res.status(400).json({ error: 'Link code is required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ hasPing: false });
  }
  
  // Check if there are any pending pings
  const hasPing = connections[linkCode].pendingPings.length > 0;
  
  if (hasPing) {
    // Clear the pings after delivering
    connections[linkCode].pendingPings = [];
  }
  
  res.json({ hasPing });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeConnections: Object.keys(connections).length
  });
});

// For local development
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Thinking of You API running on port ${PORT}`);
});

// For serverless deployment (Vercel/Netlify)
module.exports = app;
