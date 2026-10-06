const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const mainRoutes = require('./routes/main');
const habitRoutes = require('./routes/habits');
const socialRoutes = require('./routes/social');
const store = require('./models/store');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: false } });
const PORT = process.env.PORT || 4000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '0');
  next();
});

// simple in-memory rate limit for auth
const authHits = new Map();
function rateLimitAuth(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'x';
  const now = Date.now();
  let arr = authHits.get(ip) || [];
  arr = arr.filter(t => now - t < 15 * 60 * 1000);
  if (arr.length >= 40) return res.status(429).send('Too many requests');
  arr.push(now);
  authHits.set(ip, arr);
  next();
}
app.use('/auth/login', rateLimitAuth);
app.use('/auth/register', rateLimitAuth);


const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'atomic-habit-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 14 * 24 * 3600 * 1000 }
});
app.use(sessionMiddleware);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.googleEnabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  next();
});

app.use('/auth', authRoutes);
app.use('/habits', habitRoutes);
app.use('/', socialRoutes);
app.use('/', mainRoutes);
app.use((req, res) => res.status(404).render('404', { title: 'یافت نشد' }));

const CHAT_LIMIT = 120;
const chatRooms = new Map();
function getRoom(id) {
  if (!chatRooms.has(id)) chatRooms.set(id, { messages: [], users: new Map() });
  return chatRooms.get(id);
}

// pairId -> { left, planned, running, interval, ready: {userId: true} }
const pairTimers = new Map();

io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

io.on('connection', (socket) => {
  const sess = socket.request.session;
  const user = sess && sess.user;
  if (!user) { socket.disconnect(true); return; }

  socket.join('user:' + user.id);

  socket.on('join', (roomId) => {
    const room = String(roomId || '').slice(0, 40);
    if (!room.startsWith('group-') && !room.startsWith('pair-')) return;
    // authorize
    try {
      if (room.startsWith('group-')) {
        const g = store.getGroup(Number(room.replace('group-', '')));
        if (!g || !(g.member_ids || []).map(Number).includes(Number(user.id))) {
          socket.emit('error_msg', 'دسترسی به چت گروه ندارید');
          return;
        }
      } else if (room.startsWith('pair-')) {
        const p = store.getPair(Number(room.replace('pair-', '')));
        if (!p || (Number(user.id) !== Number(p.from_id) && Number(user.id) !== Number(p.to_id))) {
          socket.emit('error_msg', 'دسترسی به این اتاق ندارید');
          return;
        }
      }
    } catch (e) { return; }
    socket.join(room);
    const r = getRoom(room);
    r.users.set(socket.id, { id: user.id, name: user.name || user.username });
    socket.emit('history', r.messages.slice(-60));
    io.to(room).emit('presence', r.users.size);
  });

  socket.on('message', (payload) => {
    const room = String((payload && payload.room) || '').slice(0, 40);
    if (!room.startsWith('group-') && !room.startsWith('pair-')) return;
    const text = String((payload && payload.text) || '').trim().slice(0, 1000);
    if (!text) return;
    const r = getRoom(room);
    const replyTo = payload.replyTo || null;
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      userId: user.id,
      name: user.name || user.username,
      text,
      replyTo: replyTo ? {
        id: replyTo.id,
        userId: replyTo.userId || replyTo.user_id || null,
        name: replyTo.name,
        text: String(replyTo.text || '').slice(0, 120)
      } : null,
      at: new Date().toISOString()
    };
    r.messages.push(msg);
    if (r.messages.length > CHAT_LIMIT) r.messages.shift();
    io.to(room).emit('message', msg);
    // persist + realtime notify original author on reply
    if (replyTo && replyTo.userId && Number(replyTo.userId) !== Number(user.id)) {
      let link = '/';
      if (room.startsWith('group-')) {
        link = '/chat?room=' + encodeURIComponent(room) + '&msg=' + encodeURIComponent(msg.id);
      } else if (room.startsWith('pair-')) {
        link = '/pair/' + room.replace(/^pair-/, '') + '?msg=' + encodeURIComponent(msg.id);
      }
      const title = (user.name || user.username) + ' به پیام شما پاسخ داد';
      const message = text.slice(0, 100);
      try {
        store.addNotification(Number(replyTo.userId), {
          type: 'chat_reply',
          title: title,
          message: message,
          link: link
        });
      } catch (e) {}
      io.to('user:' + replyTo.userId).emit('notification', {
        title: title,
        message: message,
        link: link
      });
    }
  });

  // ---- Pair: both must click ready, then shared timer ----
  socket.on('pair:join', (pairId) => {
    pairId = String(pairId);
    const p = store.getPair(Number(pairId));
    if (!p || (Number(user.id) !== Number(p.from_id) && Number(user.id) !== Number(p.to_id))) {
      socket.emit('error_msg', 'دسترسی ندارید');
      return;
    }
    socket.join('pair-timer-' + pairId);
    let t = pairTimers.get(pairId);
    if (!t) {
      t = { left: 0, planned: 25, running: false, interval: null, ready: {} };
      pairTimers.set(pairId, t);
    }
    socket.emit('pair:state', {
      left: t.left,
      planned: t.planned,
      running: t.running,
      ready: t.ready
    });
  });

  socket.on('pair:set-minutes', (payload) => {
    const pairId = String(payload.pairId);
    let t = pairTimers.get(pairId);
    if (!t) t = { left: 0, planned: 25, running: false, interval: null, ready: {} };
    if (t.running) return;
    t.planned = Math.min(120, Math.max(1, Number(payload.minutes) || 25));
    // only init left if never started
    if (!t.left || t.left <= 0) t.left = t.planned * 60;
    t.ready = {};
    pairTimers.set(pairId, t);
    io.to('pair-timer-' + pairId).emit('pair:state', {
      left: t.left, planned: t.planned, running: false, ready: t.ready
    });
  });

  socket.on('pair:ready', (payload) => {
    const pairId = String(payload.pairId);
    let t = pairTimers.get(pairId);
    if (!t) {
      t = { left: 0, planned: Number(payload.minutes) || 25, running: false, interval: null, ready: {} };
      t.left = t.planned * 60;
    }
    if (t.running) return;
    t.ready[user.id] = true;
    pairTimers.set(pairId, t);
    io.to('pair-timer-' + pairId).emit('pair:state', {
      left: t.left || t.planned * 60,
      planned: t.planned,
      running: false,
      ready: t.ready
    });

    // both ready? need 2 unique user ids
    const readyIds = Object.keys(t.ready).filter(k => t.ready[k]);
    if (readyIds.length >= 2 && !t.running) {
      // resume from remaining time; only full reset if empty/expired
      if (!t.left || t.left <= 0) t.left = t.planned * 60;
      t.running = true;
      if (t.interval) clearInterval(t.interval);
      t.interval = setInterval(() => {
        t.left--;
        io.to('pair-timer-' + pairId).emit('pair:tick', { left: t.left, running: true });
        if (t.left <= 0) {
          clearInterval(t.interval);
          t.interval = null;
          t.running = false;
          t.ready = {};
          io.to('pair-timer-' + pairId).emit('pair:done', { planned: t.planned });
        }
      }, 1000);
      pairTimers.set(pairId, t);
      io.to('pair-timer-' + pairId).emit('pair:state', {
        left: t.left, planned: t.planned, running: true, ready: t.ready
      });
      io.to('pair-timer-' + pairId).emit('notification', {
        title: 'تمرکز مشترک شروع شد'
      });
    }
  });

  socket.on('pair:pause', (pairId) => {
    pairId = String(pairId);
    const t = pairTimers.get(pairId);
    if (!t) return;
    t.running = false;
    t.ready = {};
    if (t.interval) { clearInterval(t.interval); t.interval = null; }
    io.to('pair-timer-' + pairId).emit('pair:state', {
      left: t.left, planned: t.planned, running: false, ready: t.ready, reason: 'pause'
    });
  });

  socket.on('pair:blur', (pairId) => {
    pairId = String(pairId);
    const t = pairTimers.get(pairId);
    if (!t || !t.running) return;
    t.running = false;
    t.ready = {};
    if (t.interval) { clearInterval(t.interval); t.interval = null; }
    io.to('pair-timer-' + pairId).emit('pair:state', {
      left: t.left, planned: t.planned, running: false, ready: t.ready,
      reason: 'blur', by: user.name || user.username
    });
  });

  socket.on('disconnect', () => {
    chatRooms.forEach((r, room) => {
      if (r.users.has(socket.id)) {
        r.users.delete(socket.id);
        io.to(room).emit('presence', r.users.size);
      }
    });
  });
});

app.set('io', io);
app.set('notifyUser', (userId, payload) => {
  io.to('user:' + userId).emit('notification', payload);
});

server.listen(PORT, () => {
  console.log(`Atomic Habit → http://localhost:${PORT}`);
});
