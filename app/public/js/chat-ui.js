window.AH_EMOJIS = [
  '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗',
  '😙','😚','🙂','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐',
  '😯','😪','😫','🥱','😴','😌','😛','😜','😝','🤤','😒','😓','😔','😕','🙃','🤑',
  '😲','😖','😞','😟','😤','😢','😭','😦','😧','😨','😩','🤯','😬','😰','😱','🥵',
  '🥶','😳','🤪','😵','😡','😠','🤬','😷','🤒','🤕','🤢','🤮','🥴','😇','🥳','🥺',
  '🤠','🤡','🤥','🤫','🤭','🧐','🤓','😈','👿','👹','👺','💀','👻','👽','🤖','💩',
  '😺','😸','😹','😻','😼','😽','🙀','😿','😾',
  '👍','👎','👏','🙏','💪','✌️','🤞','🤟','🤘','👌','🤏','👋','🤚','🖐️','✋','🖖',
  '👈','👉','👆','👇','☝️','👊','✊','🤛','🤜','🙌','👐','🤲','🤝','✍️','💅',
  '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
  '🔥','⭐','✨','🎉','🎊','💯','✅','❌','⚡','🌟','💫','🏆','🎯','📚','⏰','☕'
];

window.initTgChat = function(opts) {
  var room = opts.room, myId = opts.myId, box = opts.box, socket = opts.socket;
  var replyTo = null;
  var replyBar = opts.replyBar;
  var textInput = opts.textInput;
  var sendBtn = opts.sendBtn;
  var emojiBtn = opts.emojiBtn;
  var emojiPanel = opts.emojiPanel;
  var highlightId = opts.highlightId || null;

  if (emojiPanel && emojiBtn) {
    emojiPanel.innerHTML = '';
    window.AH_EMOJIS.forEach(function(e) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = e;
      b.setAttribute('aria-label', e);
      b.onclick = function(ev) {
        ev.preventDefault();
        textInput.value += e;
        textInput.focus();
      };
      emojiPanel.appendChild(b);
    });
    emojiBtn.onclick = function(ev) {
      ev.preventDefault();
      emojiPanel.classList.toggle('open');
    };
  }

  function clearReply() {
    replyTo = null;
    if (replyBar) { replyBar.classList.remove('show'); replyBar.innerHTML = ''; }
  }
  function setReply(m) {
    replyTo = { id: m.id, userId: m.userId, name: m.name, text: m.text };
    if (replyBar) {
      replyBar.classList.add('show');
      replyBar.innerHTML = '↩ ' + m.name + ': ' + (m.text || '').slice(0, 50) +
        ' <button type="button" id="cancelReply" style="border:none;background:transparent;color:#f87171;cursor:pointer">✕</button>';
      var c = document.getElementById('cancelReply');
      if (c) c.onclick = clearReply;
    }
  }
  function add(m) {
    var mine = m.userId === myId;
    var d = document.createElement('div');
    d.className = 'tg-msg ' + (mine ? 'me' : 'them');
    d.id = 'msg-' + m.id;
    d.dataset.id = m.id;
    var html = '';
    if (!mine) html += '<div class="name">' + m.name + '</div>';
    if (m.replyTo) html += '<div class="reply-quote">' + m.replyTo.name + ': ' + (m.replyTo.text || '') + '</div>';
    html += '<div class="body"></div><div class="meta"><button type="button" class="reply-btn">پاسخ</button><span class="time"></span></div>';
    d.innerHTML = html;
    d.querySelector('.body').textContent = m.text;
    d.querySelector('.time').textContent = new Date(m.at || Date.now()).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' });
    d.querySelector('.reply-btn').onclick = function() { setReply(m); textInput.focus(); };
    box.appendChild(d);
    box.scrollTop = box.scrollHeight;
    if (highlightId && String(m.id) === String(highlightId)) {
      d.classList.add('highlight');
      d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
  socket.on('history', function(list) {
    box.innerHTML = '';
    (list || []).forEach(add);
    if (highlightId) {
      setTimeout(function() {
        var el = document.getElementById('msg-' + highlightId);
        if (el) {
          el.classList.add('highlight');
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
    }
  });
  socket.on('message', add);

  function send() {
    if (!textInput.value.trim()) return;
    socket.emit('message', { room: room, text: textInput.value, replyTo: replyTo });
    textInput.value = '';
    clearReply();
    if (emojiPanel) emojiPanel.classList.remove('open');
  }
  if (sendBtn) sendBtn.onclick = send;
  textInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
};
