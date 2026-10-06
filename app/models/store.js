const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { gregorianKeyIran, nowIran, jalaliMonthLength, MONTHS } = require('./jalali');

const DATA_DIR = path.join(__dirname, '../../data');
const DB = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function load() {
  if (!fs.existsSync(DB)) {
    return {
      users: [], habits: [], logs: [], tasks: [],
      focusSessions: [], groups: [], groupRequests: [],
      follows: [], notifications: [], pairSessions: [], activities: [],
      nextIds: { users:1,habits:1,logs:1,tasks:1,focus:1,groups:1,groupRequests:1,follows:1,notifications:1,pairs:1,activities:1 }
    };
  }
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  ['tasks','focusSessions','groups','groupRequests','follows','notifications','pairSessions','activities'].forEach(k => {
    if (!d[k]) d[k] = [];
  });
  if (!d.nextIds) d.nextIds = {};
  ['users','habits','logs','tasks','focus','groups','groupRequests','follows','notifications','pairs','activities'].forEach(k => {
    if (!d.nextIds[k]) d.nextIds[k] = 1;
  });
  return d;
}
function save(db) {
  const tmp = DB + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB);
}
let db = load();
const today = () => gregorianKeyIran();

const store = {
  // ---- users ----
  findUserByEmail(email) { return db.users.find(u => u.email === email) || null; },
  findUserByUsername(username) {
    return db.users.find(u => (u.username || '').toLowerCase() === String(username).toLowerCase()) || null;
  },
  findUserById(id) { return db.users.find(u => u.id === Number(id)) || null; },
  findUserByPublicId(pid) {
    const n = Number(pid);
    let u = db.users.find(x => Number(x.public_id) === n);
    if (u) return u;
    u = db.users.find(x => x.id === n - 100000);
    if (u) { if (!u.public_id) { u.public_id = 100000 + u.id; save(db); } return u; }
    return null;
  },
  findUserByGoogleId(gid) { return db.users.find(u => u.google_id === gid) || null; },
  listUsers() {
    return db.users.map(u => ({
      id: u.id, public_id: u.public_id || (100000+u.id), username: u.username, name: u.name, avatar: u.avatar || '🌱',
      bio: u.bio || '', farm_level: this.getFarmLevel(u.id)
    }));
  },
  createUser({ email, name, username, password, google_id }) {
    if (email && this.findUserByEmail(email)) return { error: 'این ایمیل قبلاً ثبت شده' };
    if (username && this.findUserByUsername(username)) return { error: 'این نام کاربری قبلاً گرفته شده' };
    if (!username || username.length < 3) return { error: 'نام کاربری حداقل ۳ کاراکتر و یکتا باشد' };
    const newId = db.nextIds.users++;
    const user = {
      id: newId,
      public_id: 100000 + newId,
      email: email || null,
      username: String(username).trim().toLowerCase().replace(/[^a-z0-9_\u0600-\u06FF]/gi, '').slice(0, 24),
      name: (name || username || 'کاربر').slice(0, 40),
      password: password ? bcrypt.hashSync(password, 10) : null,
      google_id: google_id || null,
      identity: 'من کسی هستم که به تعهدهای کوچک روزانه‌ام پایبند است.',
      bio: '',
      avatar: '🌱',
      created_at: new Date().toISOString()
    };
    if (!user.username) return { error: 'نام کاربری نامعتبر' };
    if (this.findUserByUsername(user.username)) return { error: 'نام کاربری تکراری است' };
    db.users.push(user);
    save(db);
    return { user };
  },
  verifyPassword(user, password) {
    if (!user.password) return false;
    return bcrypt.compareSync(password, user.password);
  },
  updateUser(id, patch) {
    const u = this.findUserById(id);
    if (!u) return null;
    const allowed = ['name','bio','identity','avatar'];
    allowed.forEach(k => { if (patch[k] !== undefined) u[k] = String(patch[k]).slice(0, k==='bio'?200:80); });
    if (patch.username) {
      const un = String(patch.username).trim().toLowerCase();
      if (un !== u.username && this.findUserByUsername(un)) return { error: 'نام کاربری تکراری' };
      u.username = un;
    }
    save(db);
    return { user: u };
  },

  // ---- habits (same as before + helpers) ----
  getHabits(userId) {
    return db.habits.filter(h => h.user_id === userId && !h.archived)
      .sort((a,b) => (a.order||0)-(b.order||0) || a.id-b.id);
  },
  getHabit(id, userId) {
    return db.habits.find(h => h.id === Number(id) && h.user_id === userId) || null;
  },
  createHabit(userId, data) {
    const habit = {
      id: db.nextIds.habits++, user_id: userId,
      title: String(data.title||'').trim().slice(0,80),
      description: String(data.description||'').trim().slice(0,300),
      category: data.category || 'general',
      cue: String(data.cue||'').slice(0,120),
      intention: String(data.intention||'').slice(0,160),
      two_minute: String(data.two_minute||'').slice(0,120),
      identity_vote: String(data.identity_vote||'').slice(0,120),
      color: data.color || '#818cf8',
      archived: false, order: 0, created_at: new Date().toISOString(),
      public_id: 100000 + db.nextIds.users // will adjust after increment - fix below
    };
    // fix public_id after id assigned - patch after push
    if (!habit.title) return { error: 'عنوان عادت الزامی است' };
    db.habits.push(habit); save(db); return { habit };
  },
  updateHabit(id, userId, data) {
    const h = this.getHabit(id, userId);
    if (!h) return { error: 'یافت نشد' };
    ['title','description','category','cue','intention','two_minute','identity_vote','color'].forEach(k => {
      if (data[k] !== undefined) h[k] = String(data[k]).trim();
    });
    if (!h.title) return { error: 'عنوان خالی نباشد' };
    save(db); return { habit: h };
  },
  deleteHabit(id, userId) {
    const h = this.getHabit(id, userId);
    if (!h) return { error: 'یافت نشد' };
    h.archived = true; save(db); return { ok: true };
  },
  isDone(userId, habitId, date) {
    return !!db.logs.find(l => l.user_id === userId && l.habit_id === habitId && l.date === (date||today()) && l.done);
  },
  toggleLog(userId, habitId, date) {
    date = date || today();
    let existing = db.logs.find(l => l.user_id === userId && l.habit_id === habitId && l.date === date);
    if (existing) {
      existing.done = !existing.done;
      if (existing.done) {
        const h = this.getHabit(habitId, userId);
        this.addActivity(userId, { type: 'habit', title: 'عادت: ' + (h ? h.title : '#' + habitId) });
      }
      save(db); return { done: existing.done };
    }
    db.logs.push({ id: db.nextIds.logs++, user_id: userId, habit_id: habitId, date, done: true });
    const h = this.getHabit(habitId, userId);
    this.addActivity(userId, { type: 'habit', title: 'عادت: ' + (h ? h.title : '#' + habitId) });
    save(db); return { done: true };
  },
  getStreak(userId, habitId) {
    let streak = 0;
    let d = new Date(today() + 'T12:00:00Z');
    if (!this.isDone(userId, habitId, today())) d.setUTCDate(d.getUTCDate() - 1);
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().slice(0,10);
      if (this.isDone(userId, habitId, key)) { streak++; d.setUTCDate(d.getUTCDate()-1); }
      else break;
    }
    return streak;
  },

  // ---- tasks ----
  getTasks(userId, date) {
    date = date || today();
    return db.tasks.filter(t => t.user_id === userId && t.date === date && !t.deleted);
  },
  createTask(userId, { title, date }) {
    const t = {
      id: db.nextIds.tasks++, user_id: userId,
      title: String(title||'').trim().slice(0,120),
      date: date || today(), done: false, deleted: false
    };
    if (!t.title) return { error: 'عنوان وظیفه الزامی است' };
    db.tasks.push(t); save(db); return { task: t };
  },
  toggleTask(userId, id) {
    const t = db.tasks.find(x => x.id === Number(id) && x.user_id === userId);
    if (!t) return { error: 'یافت نشد' };
    t.done = !t.done;
    if (t.done) {
      t.completed_at = new Date().toISOString();
      this.addActivity(userId, { type: 'task', title: 'تسک انجام شد: ' + t.title });
    }
    save(db); return { task: t };
  },
  deleteTask(userId, id) {
    const t = db.tasks.find(x => x.id === Number(id) && x.user_id === userId);
    if (!t) return { error: 'یافت نشد' };
    t.deleted = true; save(db); return { ok: true };
  },

  // ---- focus sessions (minutes) ----
  addFocusSession(userId, { minutes, label, category }) {
    const m = Math.max(1, Math.min(180, Number(minutes) || 25));
    const s = {
      id: db.nextIds.focus++, user_id: userId,
      minutes: m, label: String(label||'تمرکز').slice(0,40),
      category: category || 'focus', // focus | study | work
      date: today(), at: new Date().toISOString()
    };
    db.focusSessions.push(s);
    this.addActivity(userId, { type: 'focus', title: 'تمرکز ' + m + ' دقیقه — ' + s.label });
    this.checkAndAwardBadges(userId);
    save(db); return s;
  },
  getFocusStats(userId) {
    const sessions = db.focusSessions.filter(s => s.user_id === userId);
    const sum = (cat) => sessions.filter(s => s.category === cat).reduce((a,s) => a + s.minutes, 0);
    const todayMin = sessions.filter(s => s.date === today()).reduce((a,s) => a + s.minutes, 0);
    return {
      focusMin: sum('focus'), studyMin: sum('study'), workMin: sum('work'),
      totalMin: sessions.reduce((a,s) => a + s.minutes, 0),
      todayMin,
      sessions: sessions.slice(-20).reverse()
    };
  },

  
  addActivity(userId, { type, title, meta }) {
    db.activities.push({
      id: db.nextIds.activities++,
      user_id: userId,
      type: type || 'action',
      title: String(title || '').slice(0, 120),
      meta: meta || null,
      at: new Date().toISOString()
    });
    // keep last 200 per user roughly by trimming global if huge
    if (db.activities.length > 5000) db.activities = db.activities.slice(-4000);
    save(db);
  },
  getActivities(userId, limit = 50) {
    return db.activities
      .filter(a => a.user_id === userId)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, limit);
  },
  deleteActivity(userId, id) {
    const a = db.activities.find(x => x.id === Number(id) && x.user_id === userId);
    if (!a) return { error: 'یافت نشد' };
    db.activities = db.activities.filter(x => x.id !== Number(id));
    save(db);
    return { ok: true };
  },
  clearActivities(userId) {
    db.activities = db.activities.filter(a => a.user_id !== userId);
    save(db);
    return { ok: true };
  },
  getTaskStats(userId) {
    const tasks = db.tasks.filter(t => t.user_id === userId && t.done && !t.deleted);
    const now = new Date(today() + 'T12:00:00Z');
    const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const monthAgo = new Date(now); monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
    const yearAgo = new Date(now); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const inRange = (t, from) => {
      const d = new Date((t.completed_at || t.date) + (String(t.completed_at || '').includes('T') ? '' : 'T12:00:00Z'));
      return d >= from;
    };
    // use date field for tasks
    const byDate = (fromKey) => tasks.filter(t => t.date >= fromKey).length;
    const wKey = weekAgo.toISOString().slice(0, 10);
    const mKey = monthAgo.toISOString().slice(0, 10);
    const yKey = yearAgo.toISOString().slice(0, 10);
    return {
      week: byDate(wKey),
      month: byDate(mKey),
      year: byDate(yKey),
      total: tasks.length
    };
  },

  
  FOCUS_BADGES: [
    { id: 'wood', name: 'چوبی', emoji: '🪵', minMinutes: 60 },
    { id: 'bronze', name: 'برنزی', emoji: '🥉', minMinutes: 300 },
    { id: 'silver', name: 'نقره‌ای', emoji: '🥈', minMinutes: 900 },
    { id: 'gold', name: 'طلایی', emoji: '🥇', minMinutes: 1800 },
    { id: 'crystal', name: 'بلورین', emoji: '💎', minMinutes: 3600 },
    { id: 'diamond', name: 'الماس', emoji: '💠', minMinutes: 7200 },
    { id: 'legend', name: 'افسانه‌ای', emoji: '👑', minMinutes: 15000 }
  ],
  getFocusBadge(userId) {
    const total = this.getFocusStats(userId).totalMin;
    let current = this.FOCUS_BADGES[0];
    for (const b of this.FOCUS_BADGES) {
      if (total >= b.minMinutes) current = b;
    }
    return { ...current, totalMin: total };
  },
  checkAndAwardBadges(userId) {
    const u = this.findUserById(userId);
    if (!u) return [];
    if (!u.earned_badges) u.earned_badges = [];
    const total = this.getFocusStats(userId).totalMin;
    const newly = [];
    this.FOCUS_BADGES.forEach(b => {
      if (total >= b.minMinutes && !u.earned_badges.includes(b.id)) {
        u.earned_badges.push(b.id);
        newly.push(b);
        this.addNotification(userId, {
          type: 'badge',
          title: 'بج جدید: ' + b.name,
          message: b.emoji + ' با ' + b.minMinutes + ' دقیقه تمرکز باز شد',
          link: '/profile'
        });
        this.addActivity(userId, { type: 'badge', title: 'بج ' + b.name + ' ' + b.emoji });
      }
    });
    if (newly.length) save(db);
    return newly;
  },

  getFarmLevel(userId) {
    // compound growth metaphor: completions + focus minutes
    const habits = this.getHabits(userId);
    let votes = 0;
    habits.forEach(h => {
      votes += db.logs.filter(l => l.user_id === userId && l.habit_id === h.id && l.done).length;
    });
    const focus = this.getFocusStats(userId).totalMin;
    const xp = votes * 10 + Math.floor(focus / 5);
    const level = Math.min(20, 1 + Math.floor(xp / 50));
    const stage = level < 3 ? '🌱 بذر' : level < 6 ? '🌿 جوانه' : level < 10 ? '🌳 نهال' : level < 15 ? '🌲 درخت' : '🏞️ مزرعه';
    const pct = Math.min(100, Math.round((xp % 50) / 50 * 100));
    return { xp, level, stage, pct, votes };
  },

  getDashboard(userId) {
    const habits = this.getHabits(userId);
    const t = today();
    const items = habits.map(h => ({
      ...h, done_today: this.isDone(userId, h.id, t), streak: this.getStreak(userId, h.id)
    }));
    const doneCount = items.filter(i => i.done_today).length;
    const total = items.length;
    const percent = total ? Math.round((doneCount / total) * 100) : 0;
    const bestStreak = items.reduce((m,i) => Math.max(m, i.streak), 0);
    const weekLabels = [], weekDone = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(t + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0,10);
      weekLabels.push(key.slice(5));
      let c = 0;
      habits.forEach(h => { if (this.isDone(userId, h.id, key)) c++; });
      weekDone.push(c);
    }
    const iran = nowIran();
    const monthLen = iran.monthLen;
    // map heat for current jalali month approx using last monthLen gregorian days
    const heat = [];
    for (let i = monthLen - 1; i >= 0; i--) {
      const d = new Date(t + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0,10);
      let c = 0;
      habits.forEach(h => { if (this.isDone(userId, h.id, key)) c++; });
      heat.push({ date: key, count: c, max: total || 1 });
    }
    return {
      items, doneCount, total, percent, bestStreak,
      week: { labels: weekLabels, completed: weekDone },
      heat, today: t, iran, monthLen,
      tasks: this.getTasks(userId, t),
      focus: this.getFocusStats(userId),
      farm: this.getFarmLevel(userId),
      taskStats: this.getTaskStats(userId),
      focusBadge: this.getFocusBadge(userId)
    };
  },

  addActivity(userId, data) {
    const type = (data && data.type) || 'action';
    const title = String((data && data.title) || '').slice(0, 120);
    const meta = (data && data.meta) || null;
    if (!db.nextIds.activities) db.nextIds.activities = 1;
    if (!db.activities) db.activities = [];
    db.activities.push({
      id: db.nextIds.activities++,
      user_id: userId,
      type: type,
      title: title,
      meta: meta,
      at: new Date().toISOString()
    });
    if (db.activities.length > 5000) db.activities = db.activities.slice(-4000);
    save(db);
  },
  getActivities(userId, limit) {
    limit = limit || 50;
    if (!db.activities) return [];
    return db.activities
      .filter(function(a) { return a.user_id === userId; })
      .sort(function(a, b) { return new Date(b.at) - new Date(a.at); })
      .slice(0, limit);
  },
  deleteActivity(userId, id) {
    if (!db.activities) return { error: 'یافت نشد' };
    const a = db.activities.find(function(x) { return x.id === Number(id) && x.user_id === userId; });
    if (!a) return { error: 'یافت نشد' };
    db.activities = db.activities.filter(function(x) { return x.id !== Number(id); });
    save(db);
    return { ok: true };
  },
  clearActivities(userId) {
    if (!db.activities) return { ok: true };
    db.activities = db.activities.filter(function(a) { return a.user_id !== userId; });
    save(db);
    return { ok: true };
  },
  getTaskStats(userId) {
    const tasks = db.tasks.filter(function(t) { return t.user_id === userId && t.done && !t.deleted; });
    const now = new Date(today() + 'T12:00:00Z');
    const weekAgo = new Date(now); weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);
    const monthAgo = new Date(now); monthAgo.setUTCDate(monthAgo.getUTCDate() - 30);
    const yearAgo = new Date(now); yearAgo.setUTCFullYear(yearAgo.getUTCFullYear() - 1);
    const byDate = function(fromKey) {
      return tasks.filter(function(t) { return t.date >= fromKey; }).length;
    };
    return {
      week: byDate(weekAgo.toISOString().slice(0, 10)),
      month: byDate(monthAgo.toISOString().slice(0, 10)),
      year: byDate(yearAgo.toISOString().slice(0, 10)),
      total: tasks.length
    };
  },

  FOCUS_BADGES: [
    { id: 'wood', name: 'چوبی', emoji: '🪵', minMinutes: 60 },
    { id: 'bronze', name: 'برنزی', emoji: '🥉', minMinutes: 300 },
    { id: 'silver', name: 'نقره‌ای', emoji: '🥈', minMinutes: 900 },
    { id: 'gold', name: 'طلایی', emoji: '🥇', minMinutes: 1800 },
    { id: 'crystal', name: 'بلورین', emoji: '💎', minMinutes: 3600 },
    { id: 'diamond', name: 'الماس', emoji: '💠', minMinutes: 7200 },
    { id: 'legend', name: 'افسانه‌ای', emoji: '👑', minMinutes: 15000 }
  ],
  getFocusBadge(userId) {
    const total = this.getFocusStats(userId).totalMin;
    let current = this.FOCUS_BADGES[0];
    for (let i = 0; i < this.FOCUS_BADGES.length; i++) {
      const b = this.FOCUS_BADGES[i];
      if (total >= b.minMinutes) current = b;
    }
    return Object.assign({}, current, { totalMin: total });
  },
  checkAndAwardBadges(userId) {
    const u = this.findUserById(userId);
    if (!u) return [];
    if (!u.earned_badges) u.earned_badges = [];
    const total = this.getFocusStats(userId).totalMin;
    const newly = [];
    const self = this;
    this.FOCUS_BADGES.forEach(function(b) {
      if (total >= b.minMinutes && u.earned_badges.indexOf(b.id) === -1) {
        u.earned_badges.push(b.id);
        newly.push(b);
        self.addNotification(userId, {
          type: 'badge',
          title: 'بج جدید: ' + b.name,
          message: b.emoji + ' با ' + b.minMinutes + ' دقیقه تمرکز باز شد',
          link: '/profile'
        });
        self.addActivity(userId, { type: 'badge', title: 'بج ' + b.name + ' ' + b.emoji });
      }
    });
    if (newly.length) save(db);
    return newly;
  },

  getFarmLevel(userId) {
    const habits = this.getHabits(userId);
    let votes = 0;
    const self = this;
    habits.forEach(function(h) {
      votes += db.logs.filter(function(l) { return l.user_id === userId && l.habit_id === h.id && l.done; }).length;
    });
    const focus = this.getFocusStats(userId).totalMin;
    const xp = votes * 10 + Math.floor(focus / 5);
    const level = Math.min(20, 1 + Math.floor(xp / 50));
    const stage = level < 3 ? '🌱 بذر' : level < 6 ? '🌿 جوانه' : level < 10 ? '🌳 نهال' : level < 15 ? '🌲 درخت' : '🏞️ مزرعه';
    const pct = Math.min(100, Math.round((xp % 50) / 50 * 100));
    return { xp: xp, level: level, stage: stage, pct: pct, votes: votes };
  },

  // ---- social follow ----
  follow(followerId, targetId) {
    followerId = Number(followerId); targetId = Number(targetId);
    if (followerId === targetId) return { error: 'نمی‌توانی خودت را دنبال کنی' };
    if (!this.findUserById(targetId)) return { error: 'کاربر نیست' };
    if (db.follows.find(f => Number(f.follower_id) === followerId && Number(f.target_id) === targetId)) return { ok: true };
    db.follows.push({ id: db.nextIds.follows++, follower_id: followerId, target_id: targetId, at: new Date().toISOString() });
    const fu = this.findUserById(followerId);
    this.addNotification(targetId, {
      type: 'follow',
      title: 'دنبال‌کننده جدید',
      message: (fu ? fu.name : 'کاربر') + ' شما را دنبال کرد',
      link: '/u/' + followerId
    });
    this.addActivity(followerId, { type: 'follow', title: 'دنبال کردن کاربر #' + targetId });
    save(db); return { ok: true };
  },
  unfollow(followerId, targetId) {
    followerId = Number(followerId); targetId = Number(targetId);
    db.follows = db.follows.filter(f => !(Number(f.follower_id) === followerId && Number(f.target_id) === targetId));
    save(db); return { ok: true };
  },
  isFollowing(followerId, targetId) {
    followerId = Number(followerId); targetId = Number(targetId);
    return !!db.follows.find(f => Number(f.follower_id) === followerId && Number(f.target_id) === targetId);
  },
  followersCount(userId) {
    userId = Number(userId);
    return db.follows.filter(f => Number(f.target_id) === userId).length;
  },
  followingCount(userId) {
    userId = Number(userId);
    return db.follows.filter(f => Number(f.follower_id) === userId).length;
  },

  // ---- groups ----
  createGroup(leaderId, { name, description }) {
    const g = {
      id: db.nextIds.groups++,
      name: String(name||'').trim().slice(0,40),
      description: String(description||'').slice(0,200),
      leader_id: leaderId,
      member_ids: [leaderId],
      created_at: new Date().toISOString(),
      public_id: 100000 + db.nextIds.users // will adjust after increment - fix below
    };
    // fix public_id after id assigned - patch after push
    if (!g.name) return { error: 'نام گروه الزامی است' };
    db.groups.push(g); save(db); return { group: g };
  },
  getGroups() { return db.groups.slice().sort((a,b) => b.id - a.id); },
  getGroup(id) { return db.groups.find(g => g.id === Number(id)) || null; },
  requestJoinGroup(userId, groupId) {
    const g = this.getGroup(groupId);
    if (!g) return { error: 'گروه نیست' };
    if (g.member_ids.includes(userId)) return { error: 'قبلاً عضو هستی' };
    if (db.groupRequests.find(r => r.group_id === g.id && r.user_id === userId && r.status === 'pending'))
      return { error: 'درخواست قبلی در انتظار است' };
    const req = { id: db.nextIds.groupRequests++, group_id: g.id, user_id: userId, status: 'pending', at: new Date().toISOString() };
    db.groupRequests.push(req);
    this.addNotification(g.leader_id, {
      type: 'group_join', title: 'درخواست عضویت گروه',
      message: 'درخواست پیوستن به «' + g.name + '»',
      link: '/groups/' + g.id + '/requests'
    });
    save(db); return { ok: true };
  },
  acceptGroupRequest(leaderId, requestId) {
    const r = db.groupRequests.find(x => x.id === Number(requestId));
    if (!r || r.status !== 'pending') return { error: 'نامعتبر' };
    const g = this.getGroup(r.group_id);
    if (!g || g.leader_id !== leaderId) return { error: 'فقط سازنده گروه' };
    r.status = 'accepted';
    if (!g.member_ids.includes(r.user_id)) g.member_ids.push(r.user_id);
    this.addNotification(r.user_id, { type: 'group_ok', title: 'عضویت قبول شد', message: 'به «' + g.name + '» پیوستی', link: '/groups/' + g.id });
    save(db); return { ok: true };
  },
  rejectGroupRequest(leaderId, requestId) {
    const r = db.groupRequests.find(x => x.id === Number(requestId));
    if (!r || r.status !== 'pending') return { error: 'نامعتبر' };
    const g = this.getGroup(r.group_id);
    if (!g || g.leader_id !== leaderId) return { error: 'فقط سازنده' };
    r.status = 'rejected';
    this.addNotification(r.user_id, { type: 'group_no', title: 'درخواست رد شد', message: g.name, link: '/groups' });
    save(db); return { ok: true };
  },
  pendingGroupRequests(leaderId, groupId) {
    const g = this.getGroup(groupId);
    if (!g || g.leader_id !== leaderId) return [];
    return db.groupRequests.filter(r => r.group_id === g.id && r.status === 'pending').map(r => {
      const u = this.findUserById(r.user_id);
      return { ...r, username: u && u.username, name: u && u.name };
    });
  },

  // ---- notifications ----
  addNotification(userId, { type, title, message, link }) {
    db.notifications.push({
      id: db.nextIds.notifications++, user_id: userId, type, title, message, link: link || '/',
      read: false, at: new Date().toISOString()
    });
    save(db);
  },
  getNotifications(userId) {
    return db.notifications.filter(n => n.user_id === userId).sort((a,b) => new Date(b.at)-new Date(a.at)).slice(0, 40);
  },
  unreadCount(userId) {
    return db.notifications.filter(n => n.user_id === userId && !n.read).length;
  },
  markRead(userId) {
    db.notifications.forEach(n => { if (n.user_id === userId) n.read = true; });
    save(db);
  },

  // ---- pair focus ----
  createPairInvite(fromId, toId, minutes) {
    if (fromId === toId) return { error: 'خودت را دعوت نکن' };
    if (!this.findUserById(toId)) return { error: 'کاربر نیست' };
    const p = {
      id: db.nextIds.pairs++, from_id: fromId, to_id: toId,
      minutes: Math.min(120, Math.max(5, Number(minutes)||25)),
      status: 'pending', from_done: 0, to_done: 0,
      created_at: new Date().toISOString(),
      public_id: 100000 + db.nextIds.users // will adjust after increment - fix below
    };
    // fix public_id after id assigned - patch after push
    db.pairSessions.push(p);
    this.addNotification(toId, {
      type: 'pair', title: 'دعوت تمرکز مشترک',
      message: minutes + ' دقیقه با هم',
      link: '/pair/' + p.id
    });
    save(db); return { pair: p };
  },
  getPair(id) { return db.pairSessions.find(p => p.id === Number(id)) || null; },
  acceptPair(userId, id) {
    const p = this.getPair(id);
    if (!p || p.to_id !== userId || p.status !== 'pending') return { error: 'نامعتبر' };
    p.status = 'active'; p.started_at = new Date().toISOString();
    save(db); return { pair: p };
  },
  completePairSide(userId, id, minutes) {
    const p = this.getPair(id);
    if (!p || p.status !== 'active') return { error: 'فعال نیست' };
    if (p.from_id === userId) p.from_done = minutes;
    else if (p.to_id === userId) p.to_done = minutes;
    else return { error: 'عضو نیستی' };
    this.addFocusSession(userId, { minutes, label: 'تمرکز دونفره', category: 'study' });
    if (p.from_done && p.to_done) p.status = 'finished';
    save(db); return { pair: p };
  },

  // ---- leaderboard ----
  
  getUserPairs(userId) {
    return (db.pairSessions || [])
      .filter(p => p.from_id === userId || p.to_id === userId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  },
  getActivePairsForUser(userId) {
    return this.getUserPairs(userId).filter(p => p.status === 'active' || p.status === 'pending');
  },

  getLeaderboard() {
    return db.users.map(u => {
      const farm = this.getFarmLevel(u.id);
      const focus = this.getFocusStats(u.id);
      const streakBest = this.getHabits(u.id).reduce((m,h) => Math.max(m, this.getStreak(u.id, h.id)), 0);
      return {
        id: u.id, public_id: u.public_id || (100000+u.id), username: u.username, name: u.name, avatar: u.avatar || '🌱',
        xp: farm.xp, level: farm.level, stage: farm.stage,
        totalMin: focus.totalMin, streakBest,
        badge: this.getFocusBadge(u.id),
        level: farm.level
      };
    }).sort((a,b) => b.xp - a.xp || b.totalMin - a.totalMin).slice(0, 50);
  },

  getProfile(userId) {
    const u = this.findUserById(userId);
    if (!u) return null;
    return {
      user: { id: u.id, public_id: u.public_id || (100000+u.id), username: u.username, name: u.name, bio: u.bio, avatar: u.avatar, identity: u.identity },
      farm: this.getFarmLevel(userId),
      focus: this.getFocusStats(userId),
      habits: this.getHabits(userId).map(function(h) {
        return { title: h.title, streak: this.getStreak(userId, h.id) };
      }.bind(this)),
      followers: this.followersCount(userId),
      following: this.followingCount(userId),
      taskStats: this.getTaskStats(userId),
      focusBadge: this.getFocusBadge(userId),
      badges: (u.earned_badges || []).map(function(id) {
        return this.FOCUS_BADGES.find(function(b) { return b.id === id; });
      }.bind(this)).filter(Boolean)
    };
  },

  seedDemo(userId) {
    if (this.getHabits(userId).length) return;
    [
      { title: '۲ دقیقه مطالعه', category: 'learning', two_minute: 'یک صفحه', cue: 'بعد از قهوه', color: '#8b5cf6' },
      { title: 'نوشیدن آب', category: 'health', two_minute: 'یک لیوان', cue: 'کنار میز', color: '#06b6d4' },
      { title: 'پیاده‌روی کوتاه', category: 'health', two_minute: 'کفش بپوش', cue: 'بعد ناهار', color: '#22c55e' }
    ].forEach(s => this.createHabit(userId, s));
  }
};

module.exports = store;
