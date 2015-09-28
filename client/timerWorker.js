var interval;
self.onmessage = function(e) {
  if (interval) clearInterval(interval);
  if (e.data == 'stop') return;
  interval = setInterval(function() {
    self.postMessage('');
  }, e.data);
};
