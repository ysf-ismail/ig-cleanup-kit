# Paste this into a fresh Claude Code session

Copy everything between the lines and paste it as your first message. Attach the
`collect.js`, `build_triage.py` and `triage_template.html` files from this folder,
or just point Claude at the folder.

---

I want to clean up my Instagram — I follow too many people and have too many
followers I don't know. Help me cut both down without losing people I actually know.

You'll drive my browser with the Claude in Chrome tools. I'm already signed into
Instagram. Don't ask for my password — you don't need it.

**Do it in this order:**

**1. Collect.** Open instagram.com, find my numeric user id from the page, then use
the Instagram web API (the same endpoints the site itself calls) to pull:
- my full followers list
- my full following list
- every person I've ever had a DM thread with (`/api/v1/direct_v2/inbox/`, paginated)
- a small profile photo for everyone I follow

Paginate with ~500ms between requests and write progress into `localStorage` as you
go, so nothing is lost if the tab reloads. `collect.js` in this folder has working
code for all of this — read it first rather than deriving it.

**2. Work out who I actually know.** The single best signal is **DM history**: if I've
ever exchanged a message with someone, I know them. Tag those people. Then bucket
everyone I follow by the year I followed them — you'll get this from my Instagram
data export if I have one, otherwise just use mutual-vs-one-way.

Tell me the breakdown before building anything: how many I follow, how many are
mutual, how many I've never messaged, and how that splits by year. That table is
where the real insight is — it usually shows one specific year where I added a
few hundred people I never spoke to.

**3. Build me a visual triage page.** Do NOT make me review people one at a time —
it's hundreds of decisions. Build a single self-contained HTML file: a grid of
faces, each tile showing profile photo, username, real name, follow year, whether
they follow me back, and a marker if I've messaged them. Tapping a face marks it
for unfollow. Include a zoom slider and a hover-preview so I can actually recognise
people, and filters (all / never messaged / no follow-back / mutuals). Embed the
photos as base64 so the file works offline.

`build_triage.py` + `triage_template.html` in this folder already do this — use them
instead of writing it from scratch.

**4. Execute, carefully.** Once I've picked, run the cuts. Two separate actions with
very different limits:

- **Remove a follower** (they stop following me) —
  `POST /api/v1/friendships/remove_follower/{id}/`
  Generous limit. Several hundred in one session was fine.
- **Unfollow** (I stop following them) —
  `POST /api/v1/web/friendships/{id}/unfollow/`
  Headers: `X-CSRFToken` (from the csrftoken cookie), `X-IG-App-ID: 936619743392459`,
  `X-Requested-With: XMLHttpRequest`, `credentials: 'include'`.
  Success = JSON with `status: 'ok'`. **A throttled request returns an HTML page
  instead of JSON** — treat non-JSON as throttled.
  Do NOT use `/api/v1/friendships/destroy/` — it returns HTML and silently does nothing.

**The unfollow rate limit, already measured — don't re-derive it:**
Roughly **16 unfollows per ~2 hours**. This was confirmed at 3–5s pacing, at 7–12s
pacing, via real UI button clicks (same quota), and by firing 203 requests in
parallel (only 10 landed). Page reloads and fresh CSRF tokens do **not** reset it.
Only elapsed time does. It behaves like a bucket refilling over time, so a longer
wait yields a bigger batch.

So: run until a request comes back non-JSON, then wait ~45–60 minutes, probe, and
resume. Never burst — bursting produces zero extra unfollows and raises the risk of
a hard action block.

Write each success to localStorage immediately so progress survives a tab reload.
Run it as a self-driving loop in the page, and restart it if the tab navigates away.

**Before you run anything destructive**, show me a list of anyone I've picked who I've
DM'd or followed for years — those are usually mistakes. Hold those back until I confirm.

---

## Two things worth knowing going in

**Your follower count is the visible problem, not your following count.** Removing
followers is uncapped enough to finish in one sitting. Unfollowing is the slow part.
If you only have patience for one, do the followers.

**Be realistic about the target.** Removing everyone who doesn't follow you back
leaves you at exactly your mutual count — you can't go below that without cutting
people you know. Work out that number first so you're not chasing something impossible.
