const express = require('express');
const store = require('../models/store');
const router = express.Router();


router.get('/api/user-by-id', requireAuth, (req, res) => {
  const u = store.findUserByPublicId(req.query.pid);
  if (!u) return res.json({ found: false });
  res.json({
    found: true,
    id: u.id,
    public_id: u.public_id || (100000 + u.id),
    username: u.username,
    name: u.name,
    avatar: u.avatar || '🌱',
    farm: store.getFarmLevel(u.id)
  });
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
}

router.get('/leaderboard', requireAuth, (req, res) => {
  res.render('leaderboard', { title: 'لیدربورد', board: store.getLeaderboard() });
});

router.get('/chat', requireAuth, (req, res) => {
  const room = String(req.query.room || '');
  if (room.startsWith('group-')) {
    const gid = Number(room.replace('group-', ''));
    const g = store.getGroup(gid);
    if (!g || !(g.member_ids || []).includes(req.session.user.id)) {
      return res.status(403).render('404', { title: 'دسترسی ندارید' });
    }
  } else if (room.startsWith('pair-')) {
    const pid = Number(room.replace('pair-', ''));
    const p = store.getPair(pid);
    const uid = Number(req.session.user.id);
    if (!p || (uid !== Number(p.from_id) && uid !== Number(p.to_id))) {
      return res.status(403).render('404', { title: 'دسترسی ندارید' });
    }
  } else if (room) {
    return res.status(404).render('404', { title: 'یافت نشد' });
  }
  res.render('chat', { title: 'چت', room: room });
});

router.get('/groups', requireAuth, (req, res) => {
  const me = req.session.user.id;
  const all = store.getGroups();
  const mine = all.filter(g => (g.member_ids || []).includes(me));
  const others = all.filter(g => !(g.member_ids || []).includes(me));
  res.render('groups/list', { title: 'گروه‌ها', mine, others, me });
});
router.get('/groups/new', requireAuth, (req, res) => {
  res.render('groups/form', { title: 'گروه جدید', error: null });
});
router.post('/groups/new', requireAuth, (req, res) => {
  const r = store.createGroup(req.session.user.id, req.body);
  if (r.error) return res.render('groups/form', { title: 'گروه جدید', error: r.error });
  res.redirect('/groups/' + r.group.id);
});
router.get('/groups/:id', requireAuth, (req, res) => {
  const g = store.getGroup(req.params.id);
  if (!g) return res.status(404).render('404', { title: 'یافت نشد' });
  const members = g.member_ids.map(id => store.findUserById(id)).filter(Boolean);
  const isMember = g.member_ids.includes(req.session.user.id);
  const isLeader = g.leader_id === req.session.user.id;
  res.render('groups/view', { title: g.name, group: g, members, isMember, isLeader });
});
router.post('/groups/:id/join', requireAuth, (req, res) => {
  const r = store.requestJoinGroup(req.session.user.id, req.params.id);
  res.redirect('/groups/' + req.params.id + (r.error ? '?e=' + encodeURIComponent(r.error) : '?ok=1'));
});
router.get('/groups/:id/requests', requireAuth, (req, res) => {
  const pending = store.pendingGroupRequests(req.session.user.id, req.params.id);
  res.render('groups/requests', { title: 'درخواست‌ها', pending, groupId: req.params.id });
});
router.post('/groups/requests/:id/accept', requireAuth, (req, res) => {
  store.acceptGroupRequest(req.session.user.id, req.params.id);
  res.redirect('back');
});
router.post('/groups/requests/:id/reject', requireAuth, (req, res) => {
  store.rejectGroupRequest(req.session.user.id, req.params.id);
  res.redirect('back');
});

router.get('/notifications', requireAuth, (req, res) => {
  const list = store.getNotifications(req.session.user.id);
  store.markRead(req.session.user.id);
  res.render('notifications', { title: 'اعلان‌ها', list });
});

router.get('/u/:id', requireAuth, (req, res) => {
  const profile = store.getProfile(req.params.id);
  if (!profile) return res.status(404).render('404', { title: 'یافت نشد' });
  const following = store.isFollowing(req.session.user.id, Number(req.params.id));
  const isSelf = req.session.user.id === Number(req.params.id);
  res.render('profile', { title: profile.user.username, profile, following, isSelf });
});

router.post('/u/:id/follow', requireAuth, (req, res) => {
  const tid = Number(req.params.id);
  const r = store.follow(Number(req.session.user.id), tid);
  if (r && r.error) return res.redirect('/u/' + tid);
  const io = req.app.get('io');
  if (io) io.to('user:' + tid).emit('notification', { title: 'دنبال‌کننده جدید', link: '/u/' + req.session.user.id });
  res.redirect('/u/' + tid);
});
router.post('/u/:id/unfollow', requireAuth, (req, res) => {
  const tid = Number(req.params.id);
  store.unfollow(Number(req.session.user.id), tid);
  res.redirect('/u/' + tid);
});

router.get('/profile', requireAuth, (req, res) => {
  res.redirect('/u/' + req.session.user.id);
});

router.get('/pair', requireAuth, (req, res) => {
  const uid = req.session.user.id;
  const pairs = store.getUserPairs(uid).map(p => {
    const otherId = p.from_id === uid ? p.to_id : p.from_id;
    const other = store.findUserById(otherId);
    return {
      ...p,
      otherName: other ? other.name : '?',
      otherUsername: other ? other.username : '?'
    };
  });
  res.render('pair', {
    title: 'تمرکز دونفره',
    me: store.findUserById(uid),
    activePairs: pairs.filter(p => p.status === 'active' || p.status === 'pending'),
    historyPairs: pairs.filter(p => p.status === 'finished' || p.status === 'rejected'),
    error: null
  });
});
router.post('/pair', requireAuth, (req, res) => {
  let toId = Number(req.body.to_id);
  if (req.body.public_id) {
    const u = store.findUserByPublicId(req.body.public_id);
    if (!u) return res.render('pair', { title: 'تمرکز دونفره', me: store.findUserById(req.session.user.id), error: 'آیدی پیدا نشد' });
    toId = u.id;
  }
  const r = store.createPairInvite(req.session.user.id, toId, req.body.minutes);
  if (r.error) {
    const uid = req.session.user.id;
    const pairs = store.getUserPairs(uid).map(p => {
      const otherId = p.from_id === uid ? p.to_id : p.from_id;
      const other = store.findUserById(otherId);
      return { ...p, otherName: other ? other.name : '?', otherUsername: other ? other.username : '?' };
    });
    return res.render('pair', {
      title: 'تمرکز دونفره', me: store.findUserById(uid),
      activePairs: pairs.filter(p => p.status === 'active' || p.status === 'pending'),
      historyPairs: pairs.filter(p => p.status === 'finished' || p.status === 'rejected'),
      error: r.error
    });
  }
  res.redirect('/pair/' + r.pair.id);
});
router.get('/pair/:id', requireAuth, (req, res) => {
  const pair = store.getPair(req.params.id);
  if (!pair) return res.status(404).render('404', { title: 'یافت نشد' });
  const uid = Number(req.session.user.id);
  if (uid !== Number(pair.from_id) && uid !== Number(pair.to_id)) {
    return res.status(403).render('404', { title: 'دسترسی ندارید' });
  }
  const from = store.findUserById(pair.from_id);
  const to = store.findUserById(pair.to_id);
  res.render('pair-room', { title: 'اتاق دونفره', pair, from, to, me: uid });
});
router.post('/pair/:id/accept', requireAuth, (req, res) => {
  const r = store.acceptPair(req.session.user.id, req.params.id);
  if (r && r.error) return res.status(403).render('404', { title: 'دسترسی ندارید' });
  res.redirect('/pair/' + req.params.id);
});
router.post('/pair/:id/complete', requireAuth, (req, res) => {
  const pair = store.getPair(req.params.id);
  if (!pair) return res.status(404).render('404', { title: 'یافت نشد' });
  const uid = Number(req.session.user.id);
  if (uid !== Number(pair.from_id) && uid !== Number(pair.to_id)) {
    return res.status(403).render('404', { title: 'دسترسی ندارید' });
  }
  store.completePairSide(uid, req.params.id, Number(req.body.minutes));
  res.redirect('/pair/' + req.params.id);
});

module.exports = router;
