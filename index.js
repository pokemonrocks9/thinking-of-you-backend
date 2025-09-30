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

app.post('/api/register', (req, res) => {
  const { linkCode, name, timelineToken } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  console.log(`Register request: linkCode=${linkCode}, name="${name}", token=${timelineToken ? 'yes' : 'no'}`);
  console.log(`Full timeline token for ${name}: ${timelineToken}`);
  
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

app.post('/api/ping', (req, res) => {
  const { linkCode, senderName } = req.body;
  
  if (!linkCode || !senderName) {
    return res.status(400).json({ error: 'Link code and sender name are required' });
  }
  
  if (!connections[linkCode]) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  const conn = connections[linkCode];
  
  if (!conn.name1 || !conn.name2) {
    console.log(`Ping rejected from ${senderName} - partner not connected yet`);
    return res.status(400).json({ error: 'Partner not connected yet' });
  }
  
  let partnerName = null;
  let partnerToken = null;
  
  if (conn.name1 === senderName) {
    partnerName = conn.name2;
    partnerToken = conn.token2;
  } else if (conn.name2 === senderName) {
    partnerName = conn.name1;
    partnerToken = conn.token1;
  }
  
  if (partnerName) {
    connections[linkCode].pendingPings.push({
      senderName: senderName,
      recipientName: partnerName,
      timestamp: Date.now()
    });
  }
  
  if (partnerToken && partnerName) {
    sendTimelinePin(partnerToken, senderName);
    console.log(`Ping sent from ${senderName} to ${partnerName}, Timeline notification sent`);
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
  
  if (hasPing) {
    connections[linkCode].pendingPings = connections[linkCode].pendingPings.filter(
      ping => ping.recipientName !== recipientName
    );
  }
  
  res.json({ hasPing });
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
