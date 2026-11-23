"""Generates docs/API.md from the route files (methods, access level, rate limits, doc comments, body fields)."""
import os, re
ROOT = 'src/app/api'
GROUPS = [('auth', 'Authentication'), ('me', 'Account, profile & privacy'), ('devices', 'Devices'), ('notifications', 'Notifications'),
  ('water', 'Hydration'), ('activity', 'Steps & activity'), ('workouts', 'Workouts'), ('workout-plans', 'Workouts'), ('exercises', 'Workouts'),
  ('foods', 'Nutrition'), ('nutrition', 'Nutrition'), ('grocery', 'Nutrition'), ('sleep', 'Sleep'), ('moods', 'Mental wellness'), ('journal', 'Mental wellness'),
  ('assessments', 'Mental wellness'), ('meditation', 'Meditation'), ('content', 'Content library'), ('metrics', 'Health metrics'), ('habits', 'Habits'),
  ('dashboard', 'Dashboard & analytics'), ('analytics', 'Dashboard & analytics'), ('insights', 'Dashboard & analytics'), ('ai', 'AI coach & AI health tools'),
  ('integrations', 'Wearables & integrations'), ('webhooks', 'Webhooks'), ('billing', 'Subscriptions & payments'), ('professionals', 'Professionals & appointments'),
  ('appointments', 'Professionals & appointments'), ('pro', 'Professional portal'), ('uploads', 'Uploads'), ('challenges', 'Gamification'), ('achievements', 'Gamification'),
  ('leaderboard', 'Gamification'), ('community', 'Community'), ('support', 'Support'), ('contact', 'Public'), ('health', 'Public'), ('cron', 'Scheduled jobs'), ('admin', 'Admin & super admin')]
gmap = dict(GROUPS)
rows = {}
for dp, _, fs in os.walk(ROOT):
    if 'route.ts' not in fs: continue
    path = '/api/' + os.path.relpath(dp, ROOT).replace(os.sep, '/')
    path = re.sub(r'\[(\w+)\]', r':\1', path)
    src = open(os.path.join(dp, 'route.ts')).read()
    res = re.search(r"from '@/lib/(resources|adminres)'", src)
    methods = []
    if res:
        if 'collection' in src: methods = [('GET', {}), ('POST', {})]
        else: methods = [('GET', {}), ('PATCH', {}), ('DELETE', {})]
        access = 'admin perm' if 'adminres' in src else 'user'
        for i, (m, _) in enumerate(methods): methods[i] = (m, {'access': access if access == 'user' else 'perm: content.manage / coupons.manage', 'doc': 'Generic ' + ('collection (list with ?from=&to=&page=&limit=, create)' if 'collection' in src else 'item (read, update, delete) scoped to owner')})
    else:
        for m in re.finditer(r"export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b(.*?)(?=\nexport |\Z)", src, re.S):
            body = m.group(2)
            info = {}
            head = body[:600]
            pm = re.search(r"perm: (\[[^\]]+\]|'[^']+')", head)
            if 'auth: false' in head: info['access'] = 'public'
            elif pm: info['access'] = 'perm: ' + pm.group(1).replace("'", '')
            elif m.group(1) and 'route(' not in head[:40] and 'NextRequest' in head: info['access'] = 'signed / special'
            else: info['access'] = 'user'
            rm = re.search(r"rate: \[(\d+), (\d+)\]", head)
            if rm: info['rate'] = f"{rm.group(1)}/{rm.group(2)}s"
            fields = re.findall(r"(\w+): z\.", head)
            bm = re.search(r"body: (\w+)[,\s}]", head)
            if not fields and bm:
                dm = re.search(r"const " + bm.group(1) + r" = z\.object\(\{([\s\S]*?)\n?\}\)", src)
                if dm: fields = re.findall(r"(\w+): z\.", dm.group(1))
            if fields: info['fields'] = ', '.join(dict.fromkeys(fields))
            pre = src[:m.start()].rstrip()
            dd = re.search(r"/\*\*([\s\S]*?)\*/$", pre)
            if dd: info['doc'] = ' '.join(' '.join(l.strip(' *') for l in dd.group(1).splitlines()).split())
            methods.append((m.group(1), info))
        if len(methods) == 1 and not methods[0][1].get('doc'):
            docs = re.findall(r"/\*\*([\s\S]*?)\*/", src)
            if docs: methods[0][1]['doc'] = ' '.join(' '.join(l.strip(' *') for l in docs[0].splitlines()).split())
    seg = path.split('/')[2]
    g = gmap.get(seg, 'Other')
    rows.setdefault(g, []).append((path, methods))

order = list(dict.fromkeys(v for _, v in GROUPS))
out = []
total = 0
for g in order:
    if g not in rows: continue
    out.append(f"\n## {g}\n\n| Method | Path | Access | Rate limit | Body fields | Notes |\n|---|---|---|---|---|---|")
    for path, ms in sorted(rows[g]):
        for m, inf in ms:
            total += 1
            out.append(f"| {m} | `{path}` | {inf.get('access','user')} | {inf.get('rate','')} | {inf.get('fields','')} | {inf.get('doc','')[:220]} |")
intro = open('docs/API_INTRO.md').read()
open('docs/API.md', 'w').write(intro.replace('{{COUNT}}', str(total)) + '\n'.join(out) + '\n')
print(total, 'operations documented')
