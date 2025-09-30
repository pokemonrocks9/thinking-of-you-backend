// PebbleKit JS for Thinking of You app
var API_ENDPOINT = 'https://mute-elsinore-pokyplays-01040d8f.koyeb.app/api';

var linkCode = '';
var myName = '';
var partnerName = '';
var isConfigured = false;
var pollInterval = null;

function generateLinkCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function loadSettings() {
  linkCode = localStorage.getItem('linkCode') || '';
  myName = localStorage.getItem('myName') || '';
  partnerName = localStorage.getItem('partnerName') || '';
  
  if (!linkCode) {
    linkCode = generateLinkCode();
    localStorage.setItem('linkCode', linkCode);
    console.log('Generated new link code: ' + linkCode);
  }
  
  isConfigured = (myName !== '' && partnerName !== '');
  console.log('Settings loaded. myName=' + myName + ', partnerName=' + partnerName + ', linkCode=' + linkCode + ', configured=' + isConfigured);
}

function sendConfigToWatch() {
  var dict = {
    'MESSAGE_KEY_PARTNER_NAME': partnerName,
    'MESSAGE_KEY_MY_NAME': myName,
    'MESSAGE_KEY_LINK_CODE': linkCode,
    'MESSAGE_KEY_READY': isConfigured ? 1 : 0
  };
  
  Pebble.sendAppMessage(dict,
    function() {
      console.log('Config sent to watch successfully');
    },
    function(e) {
      console.log('Failed to send config to watch: ' + JSON.stringify(e));
    }
  );
}

function registerWithBackend() {
  if (!linkCode || !myName) {
    console.log('Skipping register - linkCode=' + linkCode + ', myName=' + myName);
    return;
  }
  
  Pebble.getTimelineToken(
    function(token) {
      console.log('Got Timeline token, registering with backend');
      
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_ENDPOINT + '/register', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function() {
        if (xhr.readyState === 4) {
          console.log('Register response: ' + xhr.status + ' - ' + xhr.responseText);
        }
      };
      xhr.send(JSON.stringify({
        linkCode: linkCode,
        name: myName,
        timelineToken: token
      }));
    },
    function(error) {
      console.log('Failed to get Timeline token: ' + error + ', registering without token');
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_ENDPOINT + '/register', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        linkCode: linkCode,
        name: myName
      }));
    }
  );
}

function sendPing() {
  if (!linkCode || !myName) {
    console.log('Cannot send ping - not configured');
    return;
  }
  
  console.log('Sending ping: linkCode=' + linkCode + ', senderName=' + myName);
  
  var xhr = new XMLHttpRequest();
  xhr.open('POST', API_ENDPOINT + '/ping', true);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.onload = function() {
    if (xhr.readyState === 4) {
      console.log('Ping response: ' + xhr.status);
    }
  };
  xhr.send(JSON.stringify({
    linkCode: linkCode,
    senderName: myName
  }));
}

function checkForPings() {
  if (!linkCode || !myName) return;
  
  var xhr = new XMLHttpRequest();
  xhr.open('GET', API_ENDPOINT + '/check?linkCode=' + linkCode + '&recipientName=' + encodeURIComponent(myName), true);
  xhr.onload = function() {
    if (xhr.readyState === 4 && xhr.status === 200) {
      var response = JSON.parse(xhr.responseText);
      if (response.hasPing) {
        console.log('Received ping from partner!');
        Pebble.sendAppMessage(
          {'MESSAGE_KEY_RECEIVE_PING': 1},
          function() {
            console.log('Ping notification sent to watch');
          },
          function(e) {
            console.log('Failed to send ping to watch: ' + JSON.stringify(e));
          }
        );
      }
    }
  };
  xhr.send();
}

function startPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  pollInterval = setInterval(checkForPings, 5000);
  console.log('Started polling for pings');
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  console.log('Stopped polling');
}

Pebble.addEventListener('ready', function(e) {
  console.log('PebbleKit JS ready!');
  loadSettings();
  sendConfigToWatch();
  
  if (isConfigured) {
    registerWithBackend();
    startPolling();
  }
});

Pebble.addEventListener('appmessage', function(e) {
  console.log('Received message from watch');
  
  if (e.payload.MESSAGE_KEY_SEND_PING) {
    console.log('Watch requested to send ping');
    sendPing();
  }
});

Pebble.addEventListener('showConfiguration', function(e) {
  var url = 'https://pokemonrocks9.github.io/thinking-of-you-config/?linkCode=' + encodeURIComponent(linkCode) +
            '&myName=' + encodeURIComponent(myName) +
            '&partnerName=' + encodeURIComponent(partnerName);
  console.log('Opening config page: ' + url);
  Pebble.openURL(url);
});

Pebble.addEventListener('webviewclosed', function(e) {
  console.log('Configuration window closed');
  
  if (e && e.response) {
    console.log('Raw response: ' + e.response);
    var configData = JSON.parse(decodeURIComponent(e.response));
    console.log('Parsed config: ' + JSON.stringify(configData));
    
    if (configData.myName) {
      myName = configData.myName;
      localStorage.setItem('myName', myName);
      console.log('Saved myName: ' + myName);
    }
    
    if (configData.partnerName) {
      partnerName = configData.partnerName;
      localStorage.setItem('partnerName', partnerName);
      console.log('Saved partnerName: ' + partnerName);
    }
    
    if (configData.partnerLinkCode) {
      linkCode = configData.partnerLinkCode;
      localStorage.setItem('linkCode', linkCode);
      console.log('Joined with partner linkCode: ' + linkCode);
    }
    
    isConfigured = (myName !== '' && partnerName !== '');
    console.log('After config: isConfigured=' + isConfigured);
    
    sendConfigToWatch();
    
    if (isConfigured) {
      console.log('Calling registerWithBackend');
      registerWithBackend();
      startPolling();
    }
  } else {
    console.log('No response from config page');
  }
});
