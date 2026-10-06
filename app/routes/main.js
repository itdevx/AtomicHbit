const express = require('express');
const store = require('../models/store');
const { nowIran } = require('../models/jalali');
const router = express.Router();

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

router.get('/', (req, res) => {
  res.render('index', { title: 'Atomic Habit' });
});

router.get('/dashboard', requireAuth, (req, res) => {
  const dash = store.getDashboard(req.session.user.id);
  const user = store.findUserById(req.session.user.id);
  res.render('dashboard', {
    title: 'داشبورد',
    dash,
    identity: user ? user.identity : '',
    unread: store.unreadCount(req.session.user.id)
  });
});

router.post('/identity', requireAuth, (req, res) => {
  store.updateUser(req.session.user.id, { identity: req.body.identity });
  res.redirect('/dashboard');
});

router.post('/tasks', requireAuth, (req, res) => {
  store.createTask(req.session.user.id, { title: req.body.title });
  res.redirect('/dashboard');
});
router.post('/tasks/:id/toggle', requireAuth, (req, res) => {
  store.toggleTask(req.session.user.id, req.params.id);
  res.redirect('/dashboard');
});
router.post('/tasks/:id/delete', requireAuth, (req, res) => {
  store.deleteTask(req.session.user.id, req.params.id);
  res.redirect('/dashboard');
});

router.get('/focus', requireAuth, (req, res) => {
  const focus = store.getFocusStats(req.session.user.id);
  res.render('focus', { title: 'تایمر تمرکز', focus, iran: nowIran() });
});
router.post('/focus/complete', requireAuth, (req, res) => {
  const s = store.addFocusSession(req.session.user.id, {
    minutes: req.body.minutes,
    label: req.body.label,
    category: req.body.category || 'focus'
  });
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ ok: true, session: s, farm: store.getFarmLevel(req.session.user.id) });
  }
  res.redirect('/focus');
});


router.get('/history', requireAuth, (req, res) => {
  const list = store.getActivities(req.session.user.id, 80);
  res.render('history', { title: 'تاریخچه', list });
});
router.post('/history/:id/delete', requireAuth, (req, res) => {
  store.deleteActivity(req.session.user.id, req.params.id);
  res.redirect('/history');
});
router.post('/history/clear', requireAuth, (req, res) => {
  store.clearActivities(req.session.user.id);
  res.redirect('/history');
});
router.get('/api/dashboard', requireAuth, (req, res) => {
  const dash = store.getDashboard(req.session.user.id);
  res.json({
    percent: dash.percent,
    doneCount: dash.doneCount,
    total: dash.total,
    bestStreak: dash.bestStreak,
    todayMin: dash.focus.todayMin,
    farm: dash.farm,
    taskStats: dash.taskStats,
    week: dash.week,
    focusBadge: dash.focusBadge
  });
});

router.get('/science', (req, res) => {
  res.render('science', { title: 'اصول روانشناسی رفتاری' });
});

router.get('/api/time', (req, res) => {
  res.json(nowIran());
});

router.get('/api/notifications/unread', requireAuth, (req, res) => {
  res.json({ count: store.unreadCount(req.session.user.id) });
});

module.exports = router;
