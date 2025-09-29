const express = require('express');
const cors = require('cors');
const https = require('https');
const app = express();

app.use(cors());
app.use(express.json());

// Structure: { linkCode: { name1: "Alice", token1: "...", name2: "Bob", token2: "...", pendingPings: [] } }
const connections = {};

// Clean up old pings every 5 minutes
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

// Send Timeline pin to Pebble
function sendTimelinePin(token, senderName) {
  const pinId = 'ping-' + Date.now();
  const pin = {
    id: pinId,
    time: new Date().toISOString(),
    layout: {
      type: 'genericPin',
      title: senderName,
      subtitle: 'is thinking about you!',
      tinyIcon: 'system://images/NOTIFICATION_REMINDER',
      backgroundColor: '#FF0055'
    }
  };

  const postData = JSON.stringify(pin);
  const options = {
    hostname: 'timeline-api.rebble.io',
    port: 443,
    path: `/v1/user/pins/${pinId}`,
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Token': token,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    console.log(`Timeline pin sent. Status: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.error(`Timeline pin failed: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

// Register a device with a link code and timeline token
app.post('/api/register', (req, res) => {
  const { linkCode, name, timelineToken } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      token1: timelineToken || null,
      name2: null,
      token2: null,
      pendingPings: []
    };
  } else if (!connections[linkCode].name2 && connections[linkCode].name1 !== name) {
    connections[linkCode].name2 = name;
    connections[linkCode].token2 = timelineToken || null;
  } else if (connections[linkCode].name1 === name) {
    connections[linkCode].token1 = timelineToken || null;
  } else if (connections[linkCode].name2 === name) {
    connections[linkCode].token2 = timelineToken || null;
  }
  
  console.log(`Registered: ${name} with code ${linkCode}, token: ${timelineToken ? 'yes' : 'no'}`);
  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null
  });
});

// Send a ping
app.post('/api/register', (req, res) => {
  const { linkCode, name, timelineToken } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  console.log(`Register request: linkCode=${linkCode}, name="${name}", token=${timelineToken ? 'yes' : 'no'}`);
  
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      token1: timelineToken || null,
      name2: null,
      token2: null,
      pendingPings: []
    };
    console.log(`Created new connection: name1="${connections[linkCode].name1}"`);
  } else if (!connections[linkCode].name2 && connections[linkCode].name1 !== name) {
    connections[linkCode].name2 = name;
    connections[linkCode].token2 = timelineToken || null;
    console.log(`Added partner: name2="${connections[linkCode].name2}"`);
  } else if (connections[linkCode].name1 === name) {
    connections[linkCode].token1 = timelineToken || null;
    console.log(`Updated name1 token`);
  } else if (connections[linkCode].name2 === name) {
    connections[linkCode].token2 = timelineToken || null;
    console.log(`Updated name2 token`);
  }
  
  console.log(`Connection state: name1="${connections[linkCode].name1}", name2="${connections[linkCode].name2}"`);
  
  res.json({ 
    success: true,
    connected: connections[linkCode].name2 !== null
  });
});
  
  const conn = connections[linkCode];
  
  // Determine partner's name and token
  let partnerName = null;
  let partnerToken = null;
  
  if (conn.name1 === senderName) {
    partnerName = conn.name2;
    partnerToken = conn.token2;
  } else if (conn.name2 === senderName) {
    partnerName = conn.name1;
    partnerToken = conn.token1;
  }
  
  // Only add to pending pings if there's a partner
  if (partnerName) {
    connections[linkCode].pendingPings.push({
      senderName: senderName,
      timestamp: Date.now()
    });
  }
  
  // Send Timeline pin ONLY to partner, not sender
  if (partnerToken && partnerName) {
    sendTimelinePin(partnerToken, senderName);
    console.log(`Ping sent from ${senderName} to ${partnerName}, Timeline notification sent`);
  } else {
    console.log(`Ping sent from ${senderName}, no partner or token available`);
  }
  
  res.json({ success: true });
});

// Check for incoming pings (for active polling)
app.get('/api/check', (req, res) => {
  const { linkCode } = req.query;
  
  if (!linkCode) {
    return res.status(400).json({ error: 'Link code is required' });
  }
  
  if (!connections[linkCode]) {
    return res.json({ hasPing: false });
  }
  
  const hasPing = connections[linkCode].pendingPings.length > 0;
  
  if (hasPing) {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Thinking of You API running on port ${PORT}`);
});

module.exports = app;
