/* ------------------------------------------------------------------
   Instagram cleanup — data collection
   Run these in the browser console (or via Claude's javascript tool)
   on a page at https://www.instagram.com while signed in.

   Everything persists to localStorage as it goes, so a tab reload
   never loses progress — just re-run the same call to resume.
   ------------------------------------------------------------------ */

const APP_ID = '936619743392459';

/* --- 0. who am I? ------------------------------------------------- */
window.igMe = () => {
  const h = document.body.innerHTML;
  const m = h.match(/"profilePage_(\d+)"/) || h.match(/"user_id":"(\d+)"/);
  if (!m) throw new Error('user id not found — open your own profile page first');
  localStorage.setItem('ig_uid', m[1]);
  return m[1];
};

const uid = () => localStorage.getItem('ig_uid') || window.igMe();
const csrf = () => document.cookie.match(/csrftoken=([^;]+)/)[1];


/* --- 1. followers / following ------------------------------------- */
/* igPull('followers', 20)  /  igPull('following', 20)
   Call repeatedly until {complete:true}. Pages are ~25-100 each.      */
window.igPull = async (kind, pages = 10) => {
  const key = 'ig_' + kind;
  let S = JSON.parse(localStorage.getItem(key) ||
    '{"list":[],"next":null,"complete":false}');
  for (let i = 0; i < pages && !S.complete; i++) {
    const url = `https://www.instagram.com/api/v1/friendships/${uid()}/${kind}/?count=100`
      + (S.next ? `&max_id=${S.next}` : '');
    const r = await fetch(url, { headers: { 'X-IG-App-ID': APP_ID }, credentials: 'include' });
    if (!r.ok) { S.err = r.status; break; }
    const j = await r.json();
    (j.users || []).forEach(u => S.list.push({
      u: u.username, n: u.full_name, id: u.pk,
      pic: u.profile_pic_url, priv: !!u.is_private, ver: !!u.is_verified
    }));
    S.next = j.next_max_id || null;
    if (!S.next) S.complete = true;
    localStorage.setItem(key, JSON.stringify(S));
    if (!S.complete) await new Promise(z => setTimeout(z, 500));
  }
  localStorage.setItem(key, JSON.stringify(S));
  return { kind, total: S.list.length, complete: S.complete, err: S.err || null };
};


/* --- 2. DM history — the friend detector -------------------------- */
/* Everyone you've ever had a thread with. 1-on-1 threads score 2,
   group chats score 1, so you can weight them differently.           */
window.igDMs = async (pages = 10) => {
  const key = 'ig_dm';
  let S = JSON.parse(localStorage.getItem(key) ||
    '{"users":{},"cursor":null,"complete":false,"threads":0}');
  for (let i = 0; i < pages && !S.complete; i++) {
    const url = 'https://www.instagram.com/api/v1/direct_v2/inbox/?persistentBadging=true&limit=20'
      + (S.cursor ? '&cursor=' + encodeURIComponent(S.cursor) : '');
    const r = await fetch(url, { headers: { 'X-IG-App-ID': APP_ID }, credentials: 'include' });
    if (!r.ok) { S.err = r.status; break; }
    const j = await r.json();
    const th = j.inbox?.threads || [];
    th.forEach(t => {
      const n = (t.users || []).length;
      (t.users || []).forEach(u => {
        S.users[u.username] = Math.max(S.users[u.username] || 0, n === 1 ? 2 : 1);
      });
    });
    S.threads += th.length;
    S.cursor = j.inbox?.oldest_cursor || null;
    if (!S.cursor || !th.length) S.complete = true;
    localStorage.setItem(key, JSON.stringify(S));
    if (!S.complete) await new Promise(z => setTimeout(z, 400));
  }
  localStorage.setItem(key, JSON.stringify(S));
  return { threads: S.threads, people: Object.keys(S.users).length, complete: S.complete };
};

/* Long inboxes exceed the JS eval timeout. Fire and forget instead: */
window.igDMsAuto = () => {
  (async () => {
    while (!JSON.parse(localStorage.getItem('ig_dm') || '{"complete":false}').complete) {
      await window.igDMs(5);
    }
  })();
  return 'crawling inbox in background — poll ig_dm';
};


/* --- 3. profile photos as base64 ---------------------------------- */
/* Source images are 150x150. Stored at full size, jpeg q0.82,
   ~7KB each. 800 people lands around 5MB.                            */
window.igThumb = async (url, px = 150) => {
  const r = await fetch(url, { mode: 'cors' });
  const bm = await createImageBitmap(await r.blob());
  const c = document.createElement('canvas');
  c.width = c.height = px;
  c.getContext('2d').drawImage(bm, 0, 0, px, px);
  bm.close();
  return c.toDataURL('image/jpeg', 0.82);
};

window.igPhotos = () => {
  const all = JSON.parse(localStorage.getItem('ig_following')).list;
  window.igPics = window.igPics || {};
  window.igPicState = { done: 0, fail: 0, total: all.length, running: true };
  (async () => {
    for (const c of all) {
      if (window.igPics[c.u] !== undefined) continue;
      try { window.igPics[c.u] = await window.igThumb(c.pic); window.igPicState.done++; }
      catch (e) { window.igPics[c.u] = null; window.igPicState.fail++; }
      await new Promise(z => setTimeout(z, 50));
    }
    window.igPicState.running = false;
  })();
  return 'fetching ' + all.length + ' photos — poll window.igPicState';
};


/* --- 4. export everything to a file ------------------------------- */
window.igExport = () => {
  const fw = JSON.parse(localStorage.getItem('ig_following')).list;
  const fr = new Set(JSON.parse(localStorage.getItem('ig_followers')).list.map(x => x.u));
  const dm = JSON.parse(localStorage.getItem('ig_dm')).users;
  const out = fw.map(c => ({
    u: c.u, n: c.n || '', m: fr.has(c.u), dm: dm[c.u] ? 1 : 0,
    priv: c.priv, ver: c.ver, id: c.id,
    img: (window.igPics || {})[c.u] || null
  }));
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ig_export.json';
  document.body.appendChild(a); a.click(); a.remove();
  return { rows: out.length, mutual: out.filter(x => x.m).length,
           messaged: out.filter(x => x.dm).length,
           mb: Math.round(JSON.stringify(out).length / 1048576 * 10) / 10 };
};


/* ==================================================================
   EXECUTION — run these only after the user has picked targets
   ================================================================== */

/* Remove followers. Generous limit; several hundred per session is OK.
   Pass an array of {u, id}.                                          */
window.igRemoveFollowers = (targets) => {
  localStorage.setItem('ig_rm_targets', JSON.stringify(targets));
  window.igRm = { ok: 0, err: null, running: true, last: null };
  (async () => {
    while (window.igRm.running) {
      const done = new Set(JSON.parse(localStorage.getItem('ig_rm_done') || '[]'));
      const t = targets.find(x => !done.has(x.u));
      if (!t) { window.igRm.err = 'COMPLETE'; break; }
      const r = await fetch(
        `https://www.instagram.com/api/v1/friendships/remove_follower/${t.id}/`, {
          method: 'POST',
          headers: { 'X-CSRFToken': csrf(), 'X-IG-App-ID': APP_ID,
                     'Content-Type': 'application/x-www-form-urlencoded' },
          credentials: 'include' });
      let j = null; try { j = JSON.parse(await r.text()); } catch (e) {}
      if (!j || j.status !== 'ok') { window.igRm.err = 'stopped at @' + t.u; break; }
      done.add(t.u); localStorage.setItem('ig_rm_done', JSON.stringify([...done]));
      window.igRm.ok++; window.igRm.last = t.u;
      await new Promise(z => setTimeout(z, 3400 + Math.random() * 2400));
    }
    window.igRm.running = false;
  })();
  return 'removing ' + targets.length + ' followers — poll window.igRm';
};


/* Unfollow. HARD CAP ~16 per ~2 HOURS — see PROMPT.md. This loop
   handles the throttle itself: runs until refused, sleeps, resumes.
   Do not shorten the nap; it buys nothing.                           */
window.igUnfollow = (targets) => {
  localStorage.setItem('ig_uf_targets', JSON.stringify(targets));
  window.igUf = { done: 0, total: targets.length, thisWindow: 0,
                  windows: 0, state: 'starting', sleepUntil: null, alive: true };
  (async () => {
    const A = window.igUf;
    while (A.alive) {
      const done = new Set(JSON.parse(localStorage.getItem('ig_uf_done') || '[]'));
      const t = targets.find(x => !done.has(x.u));
      if (!t) { A.state = 'COMPLETE'; break; }
      let ok = false;
      try {
        const r = await fetch(
          `https://www.instagram.com/api/v1/web/friendships/${t.id}/unfollow/`, {
            method: 'POST',
            headers: { 'X-CSRFToken': csrf(), 'X-IG-App-ID': APP_ID,
                       'X-Requested-With': 'XMLHttpRequest',
                       'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include' });
        let j = null; try { j = JSON.parse(await r.text()); } catch (e) {}
        ok = !!j && j.status === 'ok';       // non-JSON == throttled
      } catch (e) {}

      if (ok) {
        done.add(t.u); localStorage.setItem('ig_uf_done', JSON.stringify([...done]));
        localStorage.setItem('ig_uf_lastok', Date.now());
        A.done = done.size; A.thisWindow++; A.state = 'running'; A.sleepUntil = null;
        await new Promise(z => setTimeout(z, 6000 + Math.random() * 6000));
      } else {
        if (A.thisWindow > 0) { A.windows++; A.lastBatch = A.thisWindow; }
        A.thisWindow = 0; A.state = 'sleeping';
        const nap = 45 * 60 * 1000 + Math.random() * 15 * 60 * 1000;  // 45-60 min
        A.sleepUntil = new Date(Date.now() + nap).toLocaleTimeString();
        await new Promise(z => setTimeout(z, nap));
        A.state = 'retrying';
      }
    }
    window.igUf.alive = false;
  })();
  return 'unfollowing ' + targets.length + ' — poll window.igUf. Expect ~16 per 2h.';
};
