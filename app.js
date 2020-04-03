const express = require('express');
const app = express();
const fs = require('fs');
const open = require('open');
const options = {
  key: fs.readFileSync('./fake-keys/privatekey.pem'),
  cert: fs.readFileSync('./fake-keys/certificate.pem'),
};

const serverPort = process.env.PORT || 4040;
const https = require('https');
const http = require('http');
let server;

if (process.env.LOCAL) server = https.createServer(options, app);
else server = http.createServer(app);

const io = require('socket.io')(server);
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});

app.get('/connectedUsers', function(req, res) {
  let collection = [];
  let socketIds = io.nsps['/'].adapter.rooms['1'];
  if (socketIds) for (let key in socketIds) collection.push(key);

  res.send(collection);
});

server.listen(serverPort, function() {
  console.log('server up and running at %s port', serverPort);
  if (process.env.LOCAL) open('https://localhost:' + serverPort);
});

function socketIdsInRoom(name) {
  let collection = [];
  let socketIds = io.nsps['/'].adapter.rooms[name];
  if (socketIds) for (let key in socketIds) collection.push(key);
  return collection;
}

io.on('connection', function(socket) {
  socket.on('leave', function(name, callback) {
    console.log('leave');
    if (socket.room) {
      var room = socket.room;
      io.to(room).emit('leave', socket.id);
      socket.leave(room);
    }
  });

  socket.on('join', function(name, callback) {
    console.log('join', name);
    var socketIds = socketIdsInRoom(name);
    callback(socketIds);
    socket.join(name);
    socket.room = name;
  });

  socket.on('exchange', function(data) {
    console.log('exchange', data);
    data.from = socket.id;
    var to = io.sockets.connected[data.to];
    to.emit('exchange', data);
  });
});
