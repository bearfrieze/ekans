// Config and stuffs
var svgns = "http://www.w3.org/2000/svg",
	directions = ['left', 'up', 'right', 'down'],
	moves = {left: [-1, 0], up: [0, -1], right: [1, 0], down: [0, 1]},
	hues = [0, 180, 90, 270, 45, 225, 135, 315],
	padding = 1;

// Set up WebSocket and listeners
var isLocal = new RegExp('localhost').test(location.origin),
	host = isLocal ? location.origin.replace(/^http/, 'ws') : 'ws://ekans.herokuapp.com',
	ws = new WebSocket(host),
	game = null;
ws.addEventListener('open', function() {
	ws.send(JSON.stringify({
		type: 'connect',
		gameid: 'yellowWorld'
	}));
});
ws.addEventListener('message', function(event) {
	var message = JSON.parse(event.data);
	if (message.type == 'join') {
		game = new Game(message);
	} else if (message.type == 'move') {
		game.input(message);
	} else if (message.type == 'gameover') {
		clearInterval(game.interval);
	} else if (message.type == 'reset') {
		game.reset(message);
	}
});

// Utility
var getRect = function(x, y, width, height) {
	var rect = document.createElementNS(svgns, 'rect');
	rect.setAttribute('x', x);
	rect.setAttribute('y', y);
	rect.setAttribute('width', width);
	rect.setAttribute('height', height);
	return rect;
}

// Game
var Game = function(message) {
	this.initialize(message);
}
Game.prototype.initialize = function(message) {

	this.playerid = message.playerid;
	this.board = message.board;
	this.round = message.round;
	this.cols = this.board[0].length;
	this.rows = this.board.length;

	this.svg = document.createElementNS(svgns, 'svg');
	this.svg.setAttribute('viewBox', [0, 0, this.cols + padding * 2, this.rows + padding * 2].toString());
	this.svg.setAttribute('preserveAspectRatio', 'xMidYMid');
	this.svg.setAttribute('style', 'width: 100%; height: auto; background: black;');
	this.backdrop = getRect(padding, padding, this.cols, this.rows);
	this.backdrop.setAttribute('style', 'fill: white;');
	this.svg.appendChild(this.backdrop);
	this.rects = [];
	for (var y = 0; y < this.rows; y++) {
		this.rects[y] = [];
		for (var x = 0; x < this.cols; x++) {
			var rect = getRect(x + padding, y + padding, 1, 1);
			this.rects[y][x] = rect;
			this.svg.appendChild(rect);
		}
	}
	this.overlay = getRect(0, 0, this.cols + padding * 2, this.rows + padding * 2);
	this.overlay.setAttribute('fill-opacity', '0');
	this.svg.appendChild(this.overlay);
	document.body.appendChild(this.svg);
	this.reset(message);

	document.onkeydown = function(e) {
		e.preventDefault();
		switch (e.keyCode) {
			case 37: var temp = moves['left']; break;
			case 38: var temp = moves['up']; break;
			case 39: var temp = moves['right']; break;
			case 40: var temp = moves['down']; break;
			default: return;
		}
		if (-temp[0] == this.direction[0] && -temp[1] == this.direction[1]) return;
		this.direction = temp;
	}.bind(this);
};
Game.prototype.reset = function(message) {
	this.board = message.board;
	this.round = message.round;
	this.render();
	if (message.type == 'reset') {
		this.direction = moves[directions[Math.floor(Math.random() * directions.length)]];
		this.location = message.location;
		var color = (message.winner) ? this.getColor(message.winner) : 'black';
		this.overlay.setAttribute('style', 'fill-opacity: 1; fill:' + color + ';');
		setTimeout(function() {
			this.overlay.setAttribute('style', 'fill-opacity: 0;');
			this.timer();
		}.bind(this), 500);
	}
};
Game.prototype.renderSingle = function(x, y) {
	var color = this.getColor(this.board[y][x]);
	this.rects[y][x].setAttribute('style', 'fill:' + color + ';');
}
Game.prototype.render = function() {
	for (var y = 0; y < this.rows; y++) {
		for (var x = 0; x < this.cols; x++) {
			this.renderSingle(x, y);
		}
	}
};
Game.prototype.input = function(move) {
	if (move.round != this.round) return;
	this.board[move.y][move.x] = move.playerid;
	this.renderSingle(move.x, move.y);
};
Game.prototype.move = function() {
	var move = {
		type: 'move',
		playerid: this.playerid,
		round: this.round,
		x: this.location.x += this.direction[0],
		y: this.location.y += this.direction[1]
	};
	ws.send(JSON.stringify(move));
	if (move.y in this.board)
		if (move.x in this.board[move.y])
			if (this.board[move.y][move.x] == 0)
				this.input(move);
};
Game.prototype.timer = function() {
	clearInterval(this.interval);
	this.interval = setInterval(function() {
		if (ws.readyState == 1)
			this.move();
		else
			clearInterval(this.interval);
	}.bind(this), 100);
};
Game.prototype.getColor = function(id) {
	if (id == 0) return 'white';
	return 'hsl(' + hues[id % hues.length] + ', 80%, 50%)';
}