// Set up server
var WebSocketServer = require('ws').Server,
	http = require('http'),
	express = require('express'),
	app = express(),
	port = process.env.PORT || 5000;
app.use(express.static(__dirname + '/../client/'));

var server = http.createServer(app);
server.listen(port);
console.log('http server listening on %d', port);

var wss = new WebSocketServer({server: server});
console.log('websocket server created');

// Load snakes (game id's)
var fs = require('fs'),
	snakes;
fs.readFile('server/snakes.json', 'utf8', function(error, data) {
	if (error) return console.log(error);
	snakes = JSON.parse(data);
});

// Function for getting random snakes
var randomSnake = function(collection) {

	var snake = snakes[Math.floor(Math.random() * snakes.length)];
	if (!collection) return snake.name;

	// Avoid collisions if given a collection
	var i = 0;
	while (collection[snake.name + i]) i++;
	return snake.name + i;
}

// Listen for new players and put them into games
var games = {};
wss.on('connection', function(ws) {
	ws.on('message', function(json) {
		var message = JSON.parse(json);
		if (message.type == 'connect') {
			var room = message.room;

			// Assign player to game with vacant spots
			if (!room)
				for (var game in games)
					if (games[game].numPlayers < 4) room = game;

			// If that fails, assign player to new game
			if (!room) room = randomSnake(games);

			// Make a new game if there isn't one with specified game ID
			if (!games[room]) games[room] = new Game(80, 40, room);

			// Have player join the game
			var game = games[room];
			var player = {
				ws: ws,
				name: message.name,
				alive: false,
				moves: new Array(1000)
			};
			game.join(player);

			// When player disconnnects
			ws.on('close', function() {
				console.log(room + ' : client disconnected');
				delete game.players[player.id];
				game.numPlayers--;
				if (game.numPlayers <= 0) delete games[room];
			});
		}
	});
});

var Game = function(cols, rows, room) {
	this.initialize(cols, rows, room);
	this.reset();
};

Game.prototype.initialize = function(cols, rows, room) {
	this.cols = cols;
	this.rows = rows;
	this.room = room;
	this.players = {};
	this.numPlayers = 0;
	this.board = [];
	this.round = 0;
};

Game.prototype.reset = function(winner) {

	for (var y = 0; y < this.rows; y++) {
		this.board[y] = [];
		for (var x = 0; x < this.cols; x++) {
			this.board[y][x] = 0;
		}
	}

	this.round++;

	for (var id in this.players) {

		// Reset player
		var player = this.players[id];
		player.alive = true;
		player.length = 10;
		player.moveCount = 0;

		// Dress the spawn location as a move and handle it
		var spawn = this.spawnLocation();
		var move = {
			type: 'move',
			id: player.id,
			round: this.round,
			x: spawn.x,
			y: spawn.y
		};
		this.handleMove(move, player);
	}

	for (var id in this.players) {
		this.players[id].ws.send(JSON.stringify({
			type: 'reset',
			board: this.board,
			round: this.round,
			players: this.shallowPlayers(),
			location: player.moves[0],
			winner: winner
		}));
	}

	console.log(this.room + ' : round ' + this.round);
};

Game.prototype.join = function(player) {

	console.log(this.room + ' : client joined');

	// Assign name to player if player hasn't proposed one
	if (!player.name) player.name = randomSnake();

	// Assign ID to player
	player.id = 0;
	while (true) if (!this.players[++player.id + '']) break;
	this.players[player.id] = player;

	// Notify player of sucessful join
	player.ws.send(JSON.stringify({
		type: 'join',
		id: player.id,
		name: player.name,
		room: this.room,
		board: this.board,
		round: this.round,
		players: this.shallowPlayers()
	}));

	// Reset game if player is the first one to join
	if (++this.numPlayers == 1) this.reset();

	player.ws.on('message', function(json) {
		var move = JSON.parse(json);
		if (move.type == 'move' && move.round == this.round) {
			if (this.valid(move)) {
				this.handleMove(move, player);
				for (var id in this.players)
					this.players[id].ws.send(json);
			} else {
				move.type = 'gameover';
				this.players[move.id].ws.send(JSON.stringify(move));
				this.kill(move.id);
			}
		}
	}.bind(this));
};

Game.prototype.handleMove = function(move, player) {

	this.board[move.y][move.x] = player.id;
	player.moves[player.moveCount] = move;

	if (player.moveCount >= player.length) {
		var i = player.moveCount - player.length;
		if (player.moves[i]) {
			var clear = player.moves[i];
			this.board[clear.y][clear.x] = 0;
			clear.id = 0;
			clear = JSON.stringify(clear);
			for (var id in this.players)
				this.players[id].ws.send(clear);
			delete player.moves[i];
		}
	}

	player.moveCount++;
}

Game.prototype.kill = function(id) {
	this.players[id].alive = false;
	var alive = [];
	for (var player in this.players)
		if (this.players[player].alive)
			alive.push(player);
	if (alive.length <= 1) this.reset(alive[0]);
};

Game.prototype.valid = function(move) {
	if (!(move.y in this.board)) return false;
	if (!(move.x in this.board[move.y])) return false;
	if (this.board[move.y][move.x] !== 0) return false;
	if (!this.players[move.id].alive) return false;
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
		for (var id in this.players) {
			var player = this.players[id];
			if (!player.moveCount) continue;
			var head = player.moves[player.moveCount - 1];
			dx = x - head.x;
			dy = y - head.y;
			dist = Math.sqrt(dx * dx + dy * dy);
			min = Math.min(dist, min);
		}
		if (min > max) {
			max = min;
			best.x = x;
			best.y = y;
		}
	}
	return {
		x: best.x,
		y: best.y
	};
};

Game.prototype.shallowPlayers = function() {
	var players = [];
	for (var id in this.players) {
		player = this.players[id];
		players.push({
			id: player.id,
			name: player.name
		});
	}
	return players;
}