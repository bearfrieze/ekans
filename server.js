// Set up server
var WebSocketServer = require("ws").Server,
	http = require("http"),
	express = require("express"),
	app = express(),
	port = process.env.PORT || 5000;
app.use(express.static(__dirname + "/"))

var server = http.createServer(app);
server.listen(port);
console.log("http server listening on %d", port);

var wss = new WebSocketServer({server: server});
console.log("websocket server created");

// Listen for new players and put them into games
var games = {};
wss.on('connection', function(ws) {
	console.log('client connected');
	ws.on('message', function(json) {
		var message = JSON.parse(json);
		if (message.type == 'connect') {
			var id = message.id;
			if (!games[id]) games[id] = new Game(50, 50);
			games[id].join(ws);
		}
	});
});

var Game = function(cols, rows) {
	this.initialize(cols, rows);
	this.reset();
};
Game.prototype.initialize = function(cols, rows) {
	this.cols = cols;
	this.rows = rows;
	this.players = {};
	this.counter = 0;
	this.board = [];
};
Game.prototype.reset = function() {
	for (var y = 0; y < this.rows; y++) {
		this.board[y] = [];
		for (var x = 0; x < this.cols; x++) {
			this.board[y][x] = 0;
		}
	}
};
Game.prototype.join = function(ws) {
	var id = ++this.counter;
	this.players[id] = {
		ws: ws,
		alive: true
	};
	ws.send(JSON.stringify({
		type: 'newgame',
		id: id,
		board: this.board
	}));
	ws.on('message', function(json) {
		var move = JSON.parse(json);
		if (move.type == 'move') {
			// console.log(move);
			if (this.valid(move)) {
				this.board[move.y][move.x] = move.id;
				for (var id in this.players)
					this.players[id].ws.send(json);
			} else {
				move.type = 'gameover';
				ws.send(JSON.stringify(move));
				this.kill(move.id);
			}
		}
	}.bind(this))
	ws.on('close', function() {
		console.log('client disconnected');
		delete this.players[id];
	}.bind(this));
};
Game.prototype.kill = function(id) {
	this.players[id].alive = false;
	for (var id in this.players)
		if (this.players[id].alive)
			return;
	this.reset();
	for (var id in this.players) {
		this.players[id].ws.send(JSON.stringify({
			type: 'reset',
			board: this.board
		}));
		this.players[id].alive = true;
	}
	console.log('reset');
};
Game.prototype.valid = function(move) {
	if (move.x < 0 || this.cols <= move.x) return false;
	if (move.y < 0 || this.rows <= move.y) return false;
	if (this.board[move.y][move.x] != 0) return false;
	if (!this.players[move.id].alive) return false;
	return true;
};