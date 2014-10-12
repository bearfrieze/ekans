var request = require('request'),
	htmlparser = require("htmlparser2"),
	fs = require('fs'),
	url = 'http://en.wikipedia.org/wiki/List_of_snakes_by_common_name',
	snakes = [];

// Tell the snake handler to get ready
var flags = {};
['h2', 'ul', 'li'].forEach(function(flag) { flags[flag] = false; });
var parser = new htmlparser.Parser({
	snakeDetected: function() {
		return flags.started && !flags.ended && flags.ul && flags.li;
	},
	onopentag: function(name, attribs) {
		for (var flag in flags)
			if (name === flag) flags[flag] = true;
		if (this.snakeDetected()) this.url = attribs.href;
	},
	ontext: function(snake) {
		// The snakes start at <h2>A</h2>
		if (flags.h2 && snake == 'A') flags.started = true;
		// The snakes end at <h2>See Also</h2>
		if (flags.h2 && snake == 'See also') flags.ended = true;
		// The snakes are inside li's nested in ul's
		if (this.snakeDetected()) {
			snake = snake.trim();
			// No ghost snakes
			if (snake == '') return;
			// No super long and unwieldy snakes
			if (snake.length > 20) return;
			// No snakes without links and no ambiguous snakes
			if (/(redlink|disambiguation)/.test(this.url)) return;
			// We prefer snakes without apostrophes and hyphens
			snake = snake.replace(/\'/g, '').replace(/-/g, ' ');
			// We like our snakes the best when they masquerade as camels
			snake = snake.replace(/\s\w/g, function(m) { return m.trim().toUpperCase() });
			snakes.push({name: snake, url: 'https://en.wikipedia.org' + this.url});
		}
	},
	onclosetag: function(name) {
		for (var flag in flags)
			if (name === flag) flags[flag] = false;
		if (url) url = null;
	}
});

// Fetch some snake and tell the snake handler to tame them
request(url, function(error, response, body) {
	if (!error) {
		parser.write(body);
		parser.end();
		// Store the snakes a safe place where they won't escape
		fs.writeFile('snakes.json', JSON.stringify(snakes), function(error) {
			console.log((error) ? error : 'Snakes handled and saved!');
		});
	} else {
		console.log(error);
	}
});