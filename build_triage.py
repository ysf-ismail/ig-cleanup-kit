#!/usr/bin/env python3
"""
Build the face-grid triage page from an Instagram export.

  python build_triage.py ig_export.json                      -> triage.html
  python build_triage.py ig_export.json --goal 650
  python build_triage.py ig_export.json --dates following.html

`ig_export.json` comes from window.igExport() in collect.js. Each row:
  {u, n, m, dm, priv, ver, id, img}
    u    username
    n    full name
    m    true if they follow you back
    dm   1 if you've ever had a DM thread with them
    img  base64 data URI of their profile photo (or null)

--dates is optional: point it at `following.html` from an Instagram data
export (Accounts Center -> Download your information) and rows get bucketed
by the year you followed them, which is the single most useful grouping.
Without it you get one flat list.
"""

import argparse, json, re, sys, collections
from pathlib import Path


def parse_follow_dates(path):
    """Pull {username: 'YYYY-MM-DD'} out of an IG data-export following.html."""
    html = Path(path).read_text(encoding='utf-8', errors='replace')
    text = re.sub(r'<[^>]+>', '\n', html[html.find('<body'):])
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    datepat = re.compile(r'^([A-Z][a-z]{2} \d{2}, \d{4})')
    months = {m: i for i, m in enumerate(
        ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], 1)}
    out = {}
    for i, line in enumerate(lines):
        m = datepat.match(line)
        if not m:
            continue
        j = i - 1
        while j >= 0 and lines[j].startswith('http'):
            j -= 1
        if j < 0:
            continue
        user = lines[j]
        if datepat.match(user) or ' ' in user or len(user) > 31:
            continue
        mon, day, yr = m.group(1).replace(',', '').split()
        out[user] = f'{yr}-{months[mon]:02d}-{int(day):02d}'
    return out


def tier_of(date_str, newest_year):
    """Bucket by follow year. Anyone missing a date was followed after the
    export was generated, so they're the newest cohort."""
    if not date_str:
        return 'fresh'
    y = int(date_str[:4])
    return str(y) if y >= newest_year - 5 else 'early'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('export', help='ig_export.json from collect.js')
    ap.add_argument('--dates', help='following.html from an IG data export')
    ap.add_argument('--goal', type=int, help='target following count')
    ap.add_argument('--account', default='me', help='label, keeps browser storage separate')
    ap.add_argument('-o', '--out', default='triage.html')
    ap.add_argument('--template', default='triage_template.html')
    a = ap.parse_args()

    rows = json.loads(Path(a.export).read_text(encoding='utf-8'))
    if not isinstance(rows, list) or not rows:
        sys.exit('export looks empty or is not a JSON array')

    dates = parse_follow_dates(a.dates) if a.dates else {}
    if a.dates and not dates:
        print(f'warning: no follow dates parsed out of {a.dates} — falling back to a flat list',
              file=sys.stderr)

    if dates:
        newest = max(int(d[:4]) for d in dates.values())
        for r in rows:
            d = dates.get(r['u'])
            r['d'] = d or f'{newest + 1}-01-01'
            r['tier'] = tier_of(d, newest)
        def sort_key(r):
            t = r['tier']
            if t == 'fresh':
                rank = -10 ** 6    # newest cohort first
            elif t == 'early':
                rank = 10 ** 6     # oldest bucket last
            else:
                rank = -int(t)     # years descending in between
            return (rank, -int(r['d'].replace('-', '')))
        rows.sort(key=sort_key)
        labels = {'fresh': 'Followed since your data export', 'early': 'Your oldest follows'}
        for t in {r['tier'] for r in rows}:
            labels.setdefault(t, f'Followed in {t}')
    else:
        rows.sort(key=lambda r: (r['m'], r['dm']))
        labels = {}

    goal = a.goal if a.goal else round(len(rows) * 0.7)
    payload = {
        'meta': {'goal': goal, 'account': a.account,
                 'generated': __import__('datetime').date.today().isoformat(),
                 'tierLabels': labels},
        'rows': rows,
    }

    tpl = Path(a.template).read_text(encoding='utf-8')
    if '__DATA__' not in tpl:
        sys.exit(f'{a.template} has no __DATA__ placeholder')
    Path(a.out).write_text(tpl.replace('__DATA__', json.dumps(payload)), encoding='utf-8')

    mutual = sum(1 for r in rows if r['m'])
    messaged = sum(1 for r in rows if r['dm'])
    size_mb = Path(a.out).stat().st_size / 1048576

    print(f'wrote {a.out}  ({size_mb:.1f} MB)')
    print(f'  following      {len(rows)}')
    print(f'  mutual         {mutual}')
    print(f'  one-way        {len(rows) - mutual}   <- free to cut')
    print(f'  messaged       {messaged}   <- people you actually know')
    print(f'  never messaged {len(rows) - messaged}')
    print(f'  goal           {goal}  ({len(rows) - goal} to cut)')
    if dates:
        print('\n  by year followed:')
        for t, c in sorted(collections.Counter(r['tier'] for r in rows).items(),
                           key=lambda kv: kv[0]):
            g = [r for r in rows if r['tier'] == t]
            print(f'    {t:<7} {c:>4}   {sum(1 for r in g if r["dm"]):>4} messaged')
    print(f'\n  floor: removing every non-mutual leaves you at {mutual}.')
    if goal < mutual:
        print(f'  NOTE: goal of {goal} is below that, so it needs cutting people who follow you back.')


if __name__ == '__main__':
    main()
