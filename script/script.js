var socket = io();
var RTCPeerConnection =
  window.RTCPeerConnection ||
  window.mozRTCPeerConnection ||
  window.webkitRTCPeerConnection ||
  window.msRTCPeerConnection;
var RTCSessionDescription =
  window.RTCSessionDescription ||
  window.mozRTCSessionDescription ||
  window.webkitRTCSessionDescription ||
  window.msRTCSessionDescription;
navigator.getUserMedia =
  navigator.getUserMedia ||
  navigator.mozGetUserMedia ||
  navigator.webkitGetUserMedia ||
  navigator.msGetUserMedia;
var twilioIceServers = [
  {url: 'stun:global.stun.twilio.com:3478?transport=udp'},
];
var configuration = {iceServers: [{url: 'stun:stun.l.google.com:19302'}]};
var peersList = {};
var selfView = document.getElementById('selfView');
var remoteViewContainer = document.getElementById('remoteViewContainer');
var localStream;

function getLocalStream() {
  navigator.getUserMedia(
    {
      audio: true,
      video: true,
    },
    function(stream) {
      localStream = stream;
      selfView.srcObject = stream;
      selfView.muted = false;
    },
    logError,
  );
}

function join(roomID) {
  socket.emit('join', roomID, function(socketIds) {
    console.log('join', socketIds);
    for (var i in socketIds) {
      createPC(socketIds[i], true);
    }
  });
}

function createPC(socketId, isOffer) {
  let pc = new RTCPeerConnection(configuration);
  peersList[socketId] = pc;

  pc.onicecandidate = function(event) {
    /* console.log('onicecandidate', event); */
    if (event.candidate) {
      socket.emit('exchange', {
        to: socketId,
        candidate: event.candidate,
      });
    }
  };

  function createOffer() {
    pc.createOffer(function(desc) {
      pc.setLocalDescription(
        desc,
        function() {
          socket.emit('exchange', {
            to: socketId,
            sdp: pc.localDescription,
          });
        },
        logError,
      );
    }, logError);
  }

  pc.onnegotiationneeded = function() {
    /* console.log('onnegotiationneeded'); */
    if (isOffer) {
      createOffer();
    }
  };

  pc.oniceconnectionstatechange = function(event) {
    if (event.target.iceConnectionState === 'connected') {
      createDataChannel();
    }
  };

  pc.onsignalingstatechange = function(event) {};

  pc.onaddstream = function(event) {
    let element = document.createElement('video');
    element.classList.add('remoteView');
    element.id = 'remoteView' + socketId;
    element.autoplay = 'autoplay';
    element.srcObject = event.stream;
    remoteViewContainer.appendChild(element);
  };

  pc.addStream(localStream);

  function createDataChannel() {
    /* if (pc.textDataChannel)
          return; */
    let dataChannel = pc.createDataChannel('text');
    dataChannel.onerror = function(error) {
      console.log('dataChannel.onerror', error);
    };

    dataChannel.onmessage = function(event) {
      console.log('dataChannel.onmessage:', event.data);
      var content = document.getElementById('messagesContent');
      content.innerHTML =
        content.innerHTML + '<p>' + socketId + ': ' + event.data + '</p>';
    };

    dataChannel.onopen = function() {
      console.log('dataChannel.onopen');
      var textRoom = document.getElementById('textRoom');
      textRoom.style.display = 'block';
    };

    dataChannel.onclose = function() {
      console.log('dataChannel.onclose');
    };

    pc.textDataChannel = dataChannel;
  }

  return pc;
}

function exchange(data) {
  var fromId = data.from;
  var pc;
  if (fromId in peersList) {
    pc = peersList[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    console.log('exchange sdp', data);
    pc.setRemoteDescription(
      new RTCSessionDescription(data.sdp),
      function() {
        if (pc.remoteDescription.type == 'offer') {
          pc.createAnswer(function(desc) {
            console.log('createAnswer', desc);
            pc.setLocalDescription(
              desc,
              function() {
                console.log('setLocalDescription', pc.localDescription);
                socket.emit('exchange', {
                  to: fromId,
                  sdp: pc.localDescription,
                });
              },
              logError,
            );
          }, logError);
        }
      },
      logError,
    );
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function leave(socketId) {
  console.log('leave', socketId);
  let pc = peersList[socketId];
  if (pc != null) {
    pc.close();
  }

  delete peersList[socketId];
  var video = document.getElementById('remoteView' + socketId);
  if (video) {
    video.remove();
  }
}

socket.on('exchange', function(data) {
  exchange(data);
});

socket.on('leave', function(socketId) {
  leave(socketId);
});

socket.on('connect', function(data) {
  getLocalStream();
});

function logError(error) {
  console.log('logError', error);
}

function initRoom() {
  let roomId = document.getElementById('roomId').value;
  if (roomId == '') {
    alert('missing');
  } else {
    let roomContainer = document.getElementById('roomIdContainer');
    roomContainer.parentElement.removeChild(roomContainer);
    join(roomId);
  }
}

function messageRoom() {
  var text = document.getElementById('textRoomInput').value;
  if (text == '') {
    alert('Enter something');
  } else {
    document.getElementById('textRoomInput').value = '';
    var content = document.getElementById('messagesContent');
    content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
    for (var key in peersList) {
      var pc = peersList[key];
      pc.textDataChannel.send(text);
    }
  }
}
