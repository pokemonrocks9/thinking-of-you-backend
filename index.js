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
  const postData = JSON.stringify({
    content: `💕 **${senderName}** is thinking about **${recipientName}**!`,
    username: 'Thinking of You',
    avatar_url: 'https://em-content.zobj.net/thumbs/120/apple/354/red-heart_2764-fe0f.png'
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
    console.log(`Discord webhook sent. Status: ${res.statusCode}`);
  });

  req.on('error', (e) => {
    console.error(`Discord webhook failed: ${e.message}`);
  });

  req.write(postData);
  req.end();
}

app.post('/api/register', (req, res) => {
  const { linkCode, name, webhookUrl } = req.body;
  
  if (!linkCode || !name) {
    return res.status(400).json({ error: 'Link code and name are required' });
  }
  
  console.log(`Register: linkCode=${linkCode}, name="${name}", webhook=${webhookUrl ? 'yes' : 'no'}`);
  
  if (!connections[linkCode]) {
    connections[linkCode] = {
      name1: name,
      name2: null,
      webhookUrl: webhookUrl || null,
      pendingPings: []
    };
    console.log(`Created connection: ${name}`);
  } else if (!connections[linkCode].name2 && connections[linkCode].name1 !== name) {
    connections[linkCode].name2 = name;
    console.log(`Partner joined: ${name}`);
  } else if (connections[linkCode].name1 === name) {
    if (webhookUrl) connections[linkCode].webhookUrl = webhookUrl;
    console.log(`Updated creator info`);
  } else if (connections[linkCode].name2 === name) {
    console.log(`Partner re-registered`);
  }
  
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
    console.log(`Ping rejected - partner not connected`);
    return res.status(400).json({ error: 'Partner not connected yet' });
  }
  
  let partnerName = null;
  
  if (conn.name1 === senderName) {
    partnerName = conn.name2;
  } else if (conn.name2 === senderName) {
    partnerName = conn.name1;
  }
  
  if (partnerName) {
    connections[linkCode].pendingPings.push({
      senderName: senderName,
      recipientName: partnerName,
      timestamp: Date.now()
    });
  }
  
  if (conn.webhookUrl && partnerName) {
    sendDiscordWebhook(conn.webhookUrl, senderName);
    console.log(`Discord sent from ${senderName} to ${partnerName}`);
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
