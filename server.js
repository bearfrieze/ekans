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
			var gameid = message.gameid;
			if (!games[gameid]) games[gameid] = new Game(80, 40);
			games[gameid].join(ws);
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
	this.playerid = 0;
	this.board = [];
	this.round = 0;
	this.spawns = [];
};
Game.prototype.reset = function(winner) {
	for (var y = 0; y < this.rows; y++) {
		this.board[y] = [];
		for (var x = 0; x < this.cols; x++) {
			this.board[y][x] = 0;
		}
	}
	while (this.spawns.length) this.spawns.pop();
	this.round++;
	for (var player in this.players) {
		this.players[player].ws.send(JSON.stringify({
			type: 'reset',
			board: this.board,
			round: this.round,
			location: this.spawnLocation(),
			winner: winner
		}));
		this.players[player].alive = true;
	}
	console.log('reset, round: ' + this.round);
};
Game.prototype.join = function(ws) {
	var playerid = ++this.playerid;
	this.players[playerid] = {
		ws: ws,
		alive: false
	};
	ws.send(JSON.stringify({
		type: 'join',
		playerid: playerid,
		board: this.board,
		round: this.round
	}));
	if (Object.keys(this.players).length == 1) this.reset();
	ws.on('message', function(json) {
		var move = JSON.parse(json);
		// console.log(move);
		if (move.type == 'move' && move.round == this.round) {
			if (this.valid(move)) {
				this.board[move.y][move.x] = move.playerid;
				for (var player in this.players)
					this.players[player].ws.send(json);
			} else {
				move.type = 'gameover';
				ws.send(JSON.stringify(move));
				this.kill(move.playerid);
			}
		}
	}.bind(this))
	ws.on('close', function() {
		console.log('client disconnected');
		delete this.players[playerid];
	}.bind(this));
};
Game.prototype.kill = function(playerid) {
	this.players[playerid].alive = false;
	var alive = [];
	for (var player in this.players)
		if (this.players[player].alive)
			alive.push(player);
	if (alive.length <= 1) this.reset(alive[0]);
};
Game.prototype.valid = function(move) {
	if (!(move.y in this.board)) return false;
	if (!(move.x in this.board[move.y])) return false;
	if (this.board[move.y][move.x] != 0) return false;
	if (!this.players[move.playerid].alive) return false;
	return true;
};
Game.prototype.spawnLocation = function() {
	// Best-candidate: http://bl.ocks.org/mbostock/d7bf3bd67d00ed79695b
	var max = -Infinity,
	 	best = {x: 0, y: 0};
	var min, x, y, dx, dy, dist;
	for (var i = 0; i < 5; i++) {
		min = Infinity;
		x = Math.floor(Math.random() * this.cols);
		y = Math.floor(Math.random() * this.rows);
		min = Math.min(0 + x, min); // Left
		min = Math.min(0 + y, min); // Top
		min = Math.min(this.cols - x, min); // Right
		min = Math.min(this.rows - y, min); // Bottom
		for (var j = 0; j < this.spawns.length; j++) {
			dx = x - this.spawns[j].x;
			dy = y - this.spawns[j].y;
			dist = Math.sqrt(dx * dx + dy * dy);
			min = Math.min(dist, min);
		}
		if (min > max) {
			max = min;
			best.x = x;
			best.y = y;
		}
	}
	this.spawns.push(best);
	return {
		x: best.x,
		y: best.y
	};
};