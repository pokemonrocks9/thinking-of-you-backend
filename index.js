const express = require('express');
const cors = require('cors');
const https = require('https');
const app = express();

app.use(cors());
app.use(express.json());

const connections = {};

setInterval(() => {
  const now = Date.now();
  Object.keys(connections).forEach(linkCode => {
    if (connections[linkCode].pendingPings) {
      connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(
        ping => now - ping.timestamp < 60000
      );
    }
  });
}, 300000);

function sendDiscordWebhook(webhookUrl, senderName, recipientName) {
  console.log(`Attempting Discord webhook: ${senderName} -> ${recipientName}`);
  console.log(`Webhook URL: ${webhookUrl.substring(0, 50)}...`);
  
  const postData = JSON.stringify({
    content: `**${senderName}** is thinking about **${recipientName}**!`,
    username: 'Thinking of You'
  });

  const url = new URL(webhookUrl);
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Discord webhook response: ${res.statusCode}`);
    res.on('data', (chunk) => {
      console.log(`Discord response body: ${chunk}`);
    });
  });

  req.on('error', (e) => {
    console.error(`Discord webhook ERROR: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

app.post('/api/register', (req, res) => {
  const { linkCode, name, webhookUrl, oldName } = req.body;
  
  console.log('=== REGISTER REQUEST ===');
  console.log(`linkCode: ${linkCode}`);
  console.log(`name: ${name}`);
  console.log(`oldName: ${oldName || 'NOT PROVIDED'}`);
  console.log(`webhookUrl: ${webhookUrl ? 'PROVIDED' : 'NOT PROVIDED'}`);
  if (webhookUrl) console.log(`Webhook preview: ${webhookUrl.substring(0, 50)}...`);
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  // Initialize connection if it doesn't exist
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      name2: null,
      webhookUrl: webhookUrl || null,
      pendingPings: [],
      jumbledDistance: null  // NEW: Store jumbled distance
    };
    console.log(`Created new connection for ${name}`);
  } else {
    const conn = connections[linkCode];
    
    // Check if this is an update (user is changing their name or webhook)
    if (oldName) {
      // Update name1 if it matches oldName
      if (conn.name1 === oldName) {
        conn.name1 = name;
        console.log(`Updated name1 from ${oldName} to ${name}`);
      }
      // Update name2 if it matches oldName
      if (conn.name2 === oldName) {
        conn.name2 = name;
        console.log(`Updated name2 from ${oldName} to ${name}`);
      }
    }
    
    // Handle webhook updates - always allow overwriting
    if (webhookUrl) {
      conn.webhookUrl = webhookUrl;
      console.log(`Updated webhook URL`);
    }
    
    // If this is a new registration (not an update)
    if (!oldName) {
      // Check if user already exists
      const userExists = conn.name1 === name || conn.name2 === name;
      
      if (!userExists) {
        // New partner joining
        if (!conn.name2) {
          conn.name2 = name;
          console.log(`Partner joined: ${name}`);
        } else {
          console.log(`Connection full, but allowing re-registration`);
        }
      } else {
        console.log(`User ${name} re-registered`);
      }
    }
    
    // Initialize jumbledDistance if it doesn't exist
    if (!conn.jumbledDistance) {
      conn.jumbledDistance = null;
    }
  }
  
  console.log(`Connection state: name1=${connections[linkCode].name1}, name2=${connections[linkCode].name2}, webhook=${connections[linkCode].webhookUrl ? 'SET' : 'NOT SET'}`);
  
  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null
  });
});

app.post('/api/ping', (req, res) => {
  const { linkCode, senderName, jumbledCoords } = req.body;
  
  console.log('=== PING REQUEST ===');
  console.log(`linkCode: ${linkCode}, senderName: ${senderName}`);
  console.log(`jumbledCoords: ${jumbledCoords ? 'PROVIDED (' + jumbledCoords.substring(0, 20) + '...)' : 'NOT PROVIDED'}`);
  
  if (!linkCode || !senderName) {
    return res.status(400).json({ error: 'Link code and sender name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  const conn = connections[linkCode];
  
  if (!conn.name1 || !conn.name2) {
    return res.status(400).json({ error: 'Partner not connected yet' });
  }
  
  let partnerName = null;
  
  if (conn.name1 === senderName) {
    partnerName = conn.name2;
  } else if (conn.name2 === senderName) {
    partnerName = conn.name1;
  }
  
  if (partnerName) {
    // Add to pending pings with optional location data
    connections[linkCode].pendingPings.push({
      senderName: senderName,
      recipientName: partnerName,
      timestamp: Date.now(),
      jumbledCoords: jumbledCoords || null  // NEW: Store jumbled coordinates
    });
    console.log('Added to pendingPings' + (jumbledCoords ? ' with location data' : ''));
    
    // Send Discord after 10 second delay as failsafe
    if (conn.webhookUrl) {
      setTimeout(() => {
        sendDiscordWebhook(conn.webhookUrl, senderName, partnerName);
        console.log('Discord failsafe sent after delay');
      }, 10000);
    }
  }
  
  res.json({ success: true });
});

app.get('/api/check', (req, res) => {
  const { linkCode, recipientName } = req.query;
  
  if (!linkCode || !recipientName) {
    return res.status(400).json({ error: 'Link code and recipient name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ hasPing: false });
  }
  
  const myPings = connections[linkCode].pendingPings.filter(
    ping => ping.recipientName === recipientName
  );
  
  const hasPing = myPings.length > 0;
  
  // NEW: Include jumbled coordinates if available
  let jumbledCoords = null;
  if (hasPing && myPings[0].jumbledCoords) {
    jumbledCoords = myPings[0].jumbledCoords;
    console.log('Returning ping with location data');
  }
  
  if (hasPing) {
    connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(
      ping => ping.recipientName !== recipientName
    );
  }
  
  res.json({ 
    hasPing,
    jumbledCoords: jumbledCoords  // NEW: Return jumbled coordinates
  });
});

// NEW: Store jumbled distance
app.post('/api/distance', (req, res) => {
  const { linkCode, jumbledDistance } = req.body;
  
  console.log('=== STORE DISTANCE REQUEST ===');
  console.log(`linkCode: ${linkCode}`);
  console.log(`jumbledDistance: ${jumbledDistance ? jumbledDistance.substring(0, 20) + '...' : 'NOT PROVIDED'}`);
  
  if (!linkCode || !jumbledDistance) {
    return res.status(400).json({ error: 'Link code and jumbled distance are required' });
  }
  
  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  connections[linkCode].jumbledDistance = jumbledDistance;
  console.log('Jumbled distance stored successfully');
  
  res.json({ success: true });
});

// NEW: Retrieve jumbled distance
app.get('/api/distance', (req, res) => {
  const { linkCode } = req.query;
  
  console.log('=== GET DISTANCE REQUEST ===');
  console.log(`linkCode: ${linkCode}`);
  
  if (!linkCode) {
    return res.status(400).json({ error: 'Link code is required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ jumbledDistance: null });
  }
  
  const jumbledDistance = connections[linkCode].jumbledDistance || null;
  console.log(`Returning jumbledDistance: ${jumbledDistance ? jumbledDistance.substring(0, 20) + '...' : 'NULL'}`);
  
  res.json({ jumbledDistance });
});

app.get('/api/whoIsRegistered', (req, res) => {
  const { linkCode } = req.query;
  
  console.log('=== WHO IS REGISTERED REQUEST ===');
  console.log(`linkCode: ${linkCode}`);
  
  if (!linkCode) {
    return res.status(400).json({ error: 'Link code is required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ 
      registeredNames: [],
      exists: false 
    });
  }
  
  const conn = connections[linkCode];
  const names = [];
  
  if (conn.name1) names.push(conn.name1);
  if (conn.name2) names.push(conn.name2);
  
  console.log(`Found registered names: ${names.join(', ')}`);
  
  res.json({ 
    registeredNames: names,
    exists: true
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    activeConnections: Object.keys(connections).length
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Thinking of You API running on port ${PORT}`);
});

module.exports = app;
