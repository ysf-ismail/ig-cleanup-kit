# Instagram cleanup kit

Cut down your following and follower counts without losing people you actually know.

Built from a real run: **1,222 → 487 followers, 825 → 524 following**, 736 followers
removed and 301 unfollowed.

## What's here

| File | What it's for |
|---|---|
| `PROMPT.md` | Paste into a fresh Claude session. This is the main thing. |
| `collect.js` | Browser code that pulls your lists, DM history and profile photos |
| `build_triage.py` | Turns the collected data into a visual triage page |
| `triage_template.html` | The page itself (grid of faces, zoom, filters) |

## How to run it

1. Sign into Instagram in Chrome. Have the Claude in Chrome extension connected.
2. Open a **new** Claude session in this folder.
3. Paste the block from `PROMPT.md`.
4. Claude collects your data, shows you the breakdown, builds your triage page.
5. Tap the faces you want gone, hit Download, hand the file back.
6. Claude runs the cuts at a safe pace.

Or do steps 4–6 manually:

```bash
python build_triage.py ig_export.json --goal 650
python build_triage.py ig_export.json --dates following.html --goal 650   # better
```

`--dates` takes `following.html` from an Instagram data export
(Accounts Center → Your information and permissions → Download your information → JSON).
It adds the year you followed each person, which is the most useful grouping you can
get — it usually exposes one specific year where you added hundreds of people you
never spoke to.

## The two things that make this work

**DM history is the friend detector.** If you've ever exchanged a message with
someone, you know them. Nothing else comes close as a signal — not mutual-follow,
not follower overlap. In the original run this protected 344 of 825 people
automatically. Watch for false positives on businesses, where a DM means nothing.

**Faces, not usernames.** Reviewing hundreds of people one at a time doesn't work;
you can't recognise `_bxsma._` from the handle. A grid of profile photos you scan and
tap turns hours into minutes.

## Rate limits — measured, not guessed

**Removing followers** is generous. 469 in one session with no throttling.

**Unfollowing is capped at roughly 16 per ~2 hours.** This is the thing that will
frustrate you, so take it seriously:

- 16 at 3–5s pacing. 16 at 7–12s pacing. 16 via real UI button clicks.
- 203 fired in parallel → **10 landed, 193 rejected.**
- Page reloads and fresh CSRF tokens do **not** reset it.

It's a quota per time window, not a rate limit, so going slower buys nothing and
going faster buys nothing. Only waiting helps. It behaves like a bucket refilling
with elapsed time — a longer wait yields a bigger batch.

Practically: a 200-person unfollow backlog is a ~20-hour unattended grind. Plan for
overnight, and write progress to `localStorage` after every success so a tab reload
doesn't cost you anything.

**Endpoints:**
```
POST /api/v1/friendships/remove_follower/{id}/     # remove a follower
POST /api/v1/web/friendships/{id}/unfollow/        # unfollow  <- use this one
POST /api/v1/friendships/destroy/{id}/             # DON'T - returns HTML, does nothing
```
Headers: `X-CSRFToken` (csrftoken cookie), `X-IG-App-ID: 936619743392459`,
`X-Requested-With: XMLHttpRequest`, `credentials: 'include'`.
Success is JSON with `status: 'ok'`. **A throttled request returns an HTML page**, so
treat any non-JSON response as throttled and back off.

## Know your floor before you start

Removing everyone who doesn't follow you back leaves you at exactly your **mutual
count**. You can't go below that without cutting people you know.

In the original run the goal was 500 followers and the mutual count was 753 — so the
target was impossible until we accepted cutting mutuals. Work this number out first.
`build_triage.py` prints it and warns you if your goal sits below it.

## Two honest caveats

**This is automation against Instagram**, which their terms don't allow. Nothing here
touches anyone else's account or data — it's your own follower list, read as you —
but the risk of an action block sits with you. The pacing exists to keep that to a
temporary throttle rather than something worse.

**Do the followers first.** Your follower count is what people see; your following
count only shows if someone taps into your profile. The follower side finishes in one
sitting. If you only have patience for one half, do that one.
