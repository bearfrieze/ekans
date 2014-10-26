// Config and stuffs
var svgns = "http://www.w3.org/2000/svg",
	directions = ['left', 'up', 'right', 'down'],
	moves = {left: [-1, 0], up: [0, -1], right: [1, 0], down: [0, 1]},
	colors = ['#C7493A','#6CAE3F','#7A6CBF','#A95574','#AE7F34','#618AA6','#CD53C2','#4F7F52'];

// Get url parameters
var query = decodeURIComponent(window.location.search);
query = query.substring(1).split('&');
var parameters = {};
for (var i = 0; i < query.length; i++) {
	var pair = query[i].split('=');
	parameters[pair[0]] = pair[1];
}

// Set up WebSocket and listeners
var isLocal = new RegExp('localhost').test(location.origin),
	host = isLocal ? location.origin.replace(/^http/, 'ws') : 'ws://ekans.herokuapp.com',
	ws = new WebSocket(host),
	game = null;
ws.addEventListener('open', function() {
	var message = {};
	message.type = 'connect';
	for (var parameter in parameters)
		message[parameter] = parameters[parameter];
	ws.send(JSON.stringify(message));
});
ws.addEventListener('message', function(event) {
	var message = JSON.parse(event.data);
	if (message.type == 'join') {
		game = new Game(message);
	} else if (message.type == 'move') {
		game.input(message);
	} else if (message.type == 'food') {
		game.food(message);
	} else if (message.type == 'gameover') {
		game.timer.postMessage('stop');
	} else if (message.type == 'reset') {
		game.reset(message);
	}
});

var getRect = function(x, y, width, height) {
	var rect = document.createElementNS(svgns, 'rect');
	rect.setAttribute('x', x);
	rect.setAttribute('y', y);
	rect.setAttribute('width', width);
	rect.setAttribute('height', height);
	return rect;
}

var setText = function(id, text) {
	var node = document.getElementById(id);
	while (node.firstChild) node.removeChild(node.firstChild);
	node.appendChild(document.createTextNode(text));
}

var Game = function(message) {
	this.initialize(message);
}

Game.prototype.initialize = function(message) {

	this.id = message.id;
	this.name = message.name;
	this.room = message.room;
	this.board = message.board;
	this.round = message.round;
	this.cols = this.board[0].length;
	this.rows = this.board.length;

	setText('room', this.room);
	setText('share', window.location.origin + '/?room=' + this.room);

	this.svg = document.createElementNS(svgns, 'svg');
	this.svg.setAttribute('viewBox', [0, 0, this.cols, this.rows].toString());
	this.svg.setAttribute('preserveAspectRatio', 'xMidYMid');
	this.svg.setAttribute('style', 'width: 100%; height: auto;');
	this.rects = [];
	for (var y = 0; y < this.rows; y++) {
		this.rects[y] = [];
		for (var x = 0; x < this.cols; x++) {
			var rect = getRect(x, y, 1, 1);
			this.rects[y][x] = rect;
			this.svg.appendChild(rect);
		}
	}
	this.overlay = getRect(0, 0, this.cols, this.rows);
	this.overlay.setAttribute('fill-opacity', '0');
	this.svg.appendChild(this.overlay);
	document.getElementById('game').appendChild(this.svg);

	this.reset(message);

	document.onkeydown = function(e) {
		switch (e.keyCode) {
			case 37: var temp = moves['left']; break;
			case 38: var temp = moves['up']; break;
			case 39: var temp = moves['right']; break;
			case 40: var temp = moves['down']; break;
			default: return;
		}
		if (temp) {
			e.preventDefault();
			if (-temp[0] == this.direction[0] && -temp[1] == this.direction[1]) return;
			this.newDirection = temp;
		}
	}.bind(this);

	this.timer = new Worker('timerWorker.js');
	this.timer.onmessage = this.move.bind(this);
};

Game.prototype.reset = function(message) {
	this.board = message.board;
	this.round = message.round;
	this.players = message.players;
	if (message.type == 'reset') {
		this.direction = moves[directions[Math.floor(Math.random() * directions.length)]];
		this.location = message.location;
		var color = (message.winner) ? this.getColor(message.winner) : '#333';
		this.overlay.setAttribute('style', 'fill-opacity: 1; fill:' + color + ';');
		setTimeout(function() {
			this.overlay.setAttribute('style', 'fill-opacity: 0;');
			this.timer.postMessage('90');
		}.bind(this), 500);
	}
	this.render();
};

Game.prototype.renderSingle = function(x, y) {
	var color = this.getColor(this.board[y][x]);
	this.rects[y][x].setAttribute('style', 'fill:' + color + ';');
}

Game.prototype.render = function() {

	// Update board
	for (var y = 0; y < this.rows; y++) {
		for (var x = 0; x < this.cols; x++) {
			this.renderSingle(x, y);
		}
	}

	// Update round number
	setText('round', this.round);

	// Update player legend
	if (this.players) {
		var node = document.getElementById('players');
		while (node.firstChild) node.removeChild(node.firstChild);
		this.players.forEach(function(player) {
			var li = document.createElement('li');
			var text = document.createTextNode(player.name);
			li.setAttribute('style', 'border-color: ' + this.getColor(player.id) + ';');
			li.appendChild(text);
			node.appendChild(li);
		}.bind(this));
	}
};

Game.prototype.input = function(move) {
	if (move.round != this.round) return;
	this.board[move.y][move.x] = move.id;
	this.renderSingle(move.x, move.y);
};

Game.prototype.move = function() {

	// Apply direction
	if (this.newDirection) {
		this.direction = this.newDirection;
		this.newDirection = null;
	}

	// Send move to server
	var move = {
		type: 'move',
		id: this.id,
		round: this.round,
		x: this.location.x += this.direction[0],
		y: this.location.y += this.direction[1]
	};
	ws.send(JSON.stringify(move));
	
	// Check if suicide
	if (move.y in this.board && move.x in this.board[move.y])
		if (this.board[move.y][move.x] <= 0)
			this.input(move);
		else
			this.timer.postMessage('stop');
};

Game.prototype.food = function(food) {
	this.board[food.y][food.x] = -1;
	this.renderSingle(food.x, food.y);
};

Game.prototype.getColor = function(id) {
	if (id == 0) return 'white';
	return colors[(id - 1) % colors.length];
}