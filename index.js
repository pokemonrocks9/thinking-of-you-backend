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
      jumbledDistance: null,
      webhookTimeout: null
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
  
  const conn = connections[linkCode];
  let partnerName = null;
  if (conn.name1 && conn.name1 !== name) partnerName = conn.name1;
  else if (conn.name2 && conn.name2 !== name) partnerName = conn.name2;

  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null,
    partnerName: partnerName
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
  const sName = senderName.trim().toLowerCase();
  const n1 = conn.name1.trim().toLowerCase();
  const n2 = conn.name2 ? conn.name2.trim().toLowerCase() : null;

  if (n1 === sName) {
    partnerName = conn.name2;
  } else if (n2 === sName) {
    partnerName = conn.name1;
  } else {
    console.log(`⚠️ PING REJECTED: Sender "${senderName}" doesn't match connection names ("${conn.name1}"/"${conn.name2}")`);
  }
  
  if (partnerName) {
    // Add to pending pings with optional location data
    connections[linkCode].pendingPings.push({
      senderName: senderName,
      recipientName: partnerName,
      timestamp: Date.now(),
      jumbledCoords: jumbledCoords || null  // NEW: Store jumbled coordinates
    });
    
    // Log the specific count for the recipient
    const recipientPings = conn.pendingPings.filter(p => p.recipientName === partnerName);
    console.log(`[LOVE SENT] linkCode: ${linkCode} | ${senderName} -> ${partnerName} | Count: ${recipientPings.length}${jumbledCoords ? ' (with GPS)' : ''}`);
    
    // Debounce Discord webhook: only send one notification for a spam burst
    if (conn.webhookUrl) {
      if (conn.webhookTimeout) clearTimeout(conn.webhookTimeout);
      conn.webhookTimeout = setTimeout(() => {
        sendDiscordWebhook(conn.webhookUrl, senderName, partnerName);
        conn.webhookTimeout = null;
      }, 10000);
    }
  }
  
  res.json({ success: true });
});

// Patches coords onto the sender's most recent pending ping.
// Called when GPS resolves after the fast-ping has already been sent (iOS background case).
app.post('/api/updateCoords', (req, res) => {
  const { linkCode, senderName, jumbledCoords } = req.body;

  console.log('=== UPDATE COORDS REQUEST ===');
  console.log(`linkCode: ${linkCode}, senderName: ${senderName}`);
  console.log(`jumbledCoords: ${jumbledCoords ? jumbledCoords.substring(0, 20) + '...' : 'NOT PROVIDED'}`);

  if (!linkCode || !senderName || !jumbledCoords) {
    return res.status(400).json({ error: 'linkCode, senderName, and jumbledCoords are required' });
  }

  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }

  const conn = connections[linkCode];
  const sName = senderName.trim().toLowerCase();

  // Find the most recent pending ping from this sender and patch in the coords
  let patched = false;
  for (var i = conn.pendingPings.length - 1; i >= 0; i--) {
    if (conn.pendingPings[i].senderName.trim().toLowerCase() === sName) {
      conn.pendingPings[i].jumbledCoords = jumbledCoords;
      patched = true;
      console.log(`✓ Patched coords onto ping[${i}] from ${senderName}`);
      break;
    }
  }

  if (!patched) {
    // Ping was already cleared (ACKed by watch) — too late to patch, that's fine
    console.log(`! No pending ping found for ${senderName} to patch (already cleared)`);
  }

  res.json({ success: true, patched });
});

app.get('/api/check', (req, res) => {
  const { linkCode, recipientName } = req.query;
  
  if (!linkCode || !recipientName) {
    return res.status(400).json({ error: 'Link code and recipient name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ hasPing: false });
  }
  
  const rName = recipientName.trim().toLowerCase();
  const myPings = connections[linkCode].pendingPings.filter(ping => 
    ping.recipientName && ping.recipientName.trim().toLowerCase() === rName
  );
  
  const hasPing = myPings.length > 0;
  
  if (hasPing) {
    console.log(`[CHECK] Recipient: ${recipientName} | Pending: ${myPings.length} pings (not yet cleared)`);
  }

  let jumbledCoords = null;
  if (hasPing && myPings[0].jumbledCoords) {
    jumbledCoords = myPings[0].jumbledCoords;
  }
  
  // NOTE: pings are NOT cleared here anymore — cleared only after watch ACKs via /api/clear
  res.json({ 
    hasPing,
    pingCount: myPings.length,
    jumbledCoords: jumbledCoords
  });
});

// Clear pings only after watch has ACKed receipt
app.post('/api/clear', (req, res) => {
  const { linkCode, recipientName } = req.body;

  if (!linkCode || !recipientName) {
    return res.status(400).json({ error: 'Link code and recipient name are required' });
  }

  if (!connections[linkCode]) {
    return res.json({ success: true, cleared: 0 });
  }

  const rName = recipientName.trim().toLowerCase();
  const before = connections[linkCode].pendingPings.length;
  connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(ping =>
    !ping.recipientName || ping.recipientName.trim().toLowerCase() !== rName
  );
  const cleared = before - connections[linkCode].pendingPings.length;
  console.log(`[CLEARED] Removed ${cleared} pings for ${recipientName} after watch ACK.`);

  res.json({ success: true, cleared });
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
