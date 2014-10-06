// Config and stuffs
var svgns = "http://www.w3.org/2000/svg",
	scale = 10,
	moves = {left: [-1, 0], up: [0, -1], right: [1, 0], down: [0, 1]},
	hues = [0, 180, 90, 270, 45, 225, 135, 315];

// Set up WebSocket and listeners
var host = location.origin.replace(/^http/, 'ws'),
	ws = new WebSocket(host),
	game = null;
ws.addEventListener('open', function() {
	ws.send(JSON.stringify({
		type: 'connect',
		id: 'yellowWorld'
	}));
});
ws.addEventListener('message', function(event) {
	var message = JSON.parse(event.data);
	if (message.type == 'newgame') {
		game = new Game(message);
		game.timer();
	} else if (message.type == 'move') {
		game.input(message);
	} else if (message.type == 'gameover') {
		clearInterval(game.interval);
	} else if (message.type == 'reset') {
		game.reset(message);
	}
});

// Game
var Game = function(message) {
	this.initialize(message);
}
Game.prototype.initialize = function(message) {

	this.id = message.id;
	this.board = message.board;
	this.cols = this.board[0].length;
	this.rows = this.board.length;

	this.svg = document.createElementNS(svgns, 'svg');
	this.svg.setAttribute('width', this.cols * scale);
	this.svg.setAttribute('height', this.rows * scale);
	this.svg.setAttribute('style', 'border: 1px solid black;');
	this.rects = [];
	for (var y = 0; y < this.rows; y++) {
		this.rects[y] = [];
		for (var x = 0; x < this.cols; x++) {
			var rect = document.createElementNS(svgns, 'rect');
			rect.setAttribute('width', scale);
			rect.setAttribute('height', scale);
			rect.setAttribute('x', x * scale);
			rect.setAttribute('y', y * scale);
			this.rects[y][x] = rect;
			this.svg.appendChild(rect);
		}
	}
	document.body.appendChild(this.svg);
	this.reset(message);

	var that = this;
	document.onkeydown = function(e) {
		switch (e.keyCode) {
			case 37: that.direction = moves['left']; break;
			case 38: that.direction = moves['up']; break;
			case 39: that.direction = moves['right']; break;
			case 40: that.direction = moves['down']; break;
			default: return;
		}
		e.preventDefault();
	};
};
Game.prototype.reset = function(message) {
	this.board = message.board;
	this.location = {
		x: Math.floor(Math.random() * this.cols),
		y: Math.floor(Math.random() * this.rows)
	};
	this.direction = moves['right'];
	this.render();
	this.timer();
};
Game.prototype.renderSingle = function(x, y) {
	if (this.board[y][x] > 0) {
		var hue = hues[this.board[y][x] % hues.length],
			color = 'hsl(' + hue + ', 80%, 50%)';
	} else {
		var color = 'white';
	}
	this.rects[y][x].setAttribute('style', 'fill:' + color + ';');
}
Game.prototype.render = function() {
	for (var y = 0; y < this.rows; y++) {
		for (var x = 0; x < this.cols; x++) {
			this.renderSingle(x, y);
		}
	}
};
Game.prototype.input = function(m) {
	this.board[m.y][m.x] = m.id;
	this.renderSingle(m.x, m.y);
};
Game.prototype.move = function() {
	ws.send(JSON.stringify({
		type: 'move',
		id: this.id,
		x: this.location.x += this.direction[0],
		y: this.location.y += this.direction[1]
	}));
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