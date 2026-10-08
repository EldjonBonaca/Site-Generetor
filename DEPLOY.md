# Deploy në Hostinger VPS (Ubuntu)

Aplikacioni ka nevojë për një server që punon gjithë kohën. Përdor SQLite dhe ruan skedarët te `storage/`. Prandaj duhet **VPS**: Vercel dhe hostingu i thjeshtë "shared" nuk mjaftojnë.

Si funksionon në server:

```
Browser ──HTTPS──> nginx (80/443) ──> Node (127.0.0.1:4000, PM2) ──> storage/ (SQLite, imazhe, kit, eksporte)
```

Gjithë aplikacioni mbrohet me përdorues dhe fjalëkalim (`APP_USER` / `APP_PASSWORD`). Shfletuesi e kërkon login-in vetë.

---

## 1. Përgatit serverin (vetëm herën e parë)

Hyr me SSH (IP-ja dhe fjalëkalimi root janë në hPanel → VPS → Overview):

```bash
ssh root@IP_E_SERVERIT
```

Instalo Node 22, git, nginx dhe PM2:

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs git nginx
npm install -g pm2
node -v   # duhet të jetë v22.13 ose më i ri
```

Hap portat në firewall (nëse `ufw` është aktiv):

```bash
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```

> Hostinger ka edhe firewall-in e vet te hPanel → VPS → Security → Firewall. Nëse e përdor, lejo portat 22, 80 dhe 443 edhe atje.

## 2. Shkarko projektin

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/EldjonBonaca/Site-Generetor.git site-generator
cd site-generator
npm ci
npm run build
```

## 3. Konfiguro `backend/.env`

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Vendos të paktën këto:

```env
PORT=4000
HOST=127.0.0.1
TRUST_PROXY=1
APP_USER=admin
APP_PASSWORD=një-fjalëkalim-i-gjatë-dhe-i-fortë
ENCRYPTION_KEY=
```

Nëse `ENCRYPTION_KEY` mbetet bosh, krijohet automatikisht në nisjen e parë. **Ruaje një kopje të tij.** Pa të, API key-t e ruajtura nuk mund të deshifrohen më.

## 4. Nis aplikacionin me PM2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup    # ekzekuto komandën që të shfaq, që të niset vetë pas restart-it
```

Kontrollo:

```bash
pm2 logs site-generator --lines 20
curl http://127.0.0.1:4000/api/health   # {"ok":true}
```

## 5. Domain + nginx + HTTPS

1. Te hPanel → Domains → DNS, krijo një **A record**, p.sh. `generator` → IP-ja e VPS-it.
2. Konfiguro nginx:

```bash
cp deploy/nginx.conf /etc/nginx/sites-available/site-generator
nano /etc/nginx/sites-available/site-generator   # ndrysho generator.example.com me domain-in tënd
ln -s /etc/nginx/sites-available/site-generator /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

3. Aktivizo HTTPS falas me Let's Encrypt:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d generator.domaini-yt.com
```

Tani hape `https://generator.domaini-yt.com`. Shfletuesi kërkon përdoruesin dhe fjalëkalimin nga `.env`.

> Përdor gjithmonë HTTPS. Login-i dërgohet në çdo kërkesë, dhe pa HTTPS mund të lexohet nga kushdo në rrjet.

---

## Përditësimi (kur ndryshon kodi)

```bash
cd /var/www/site-generator
git pull
npm ci
npm run build
pm2 restart site-generator
```

Mos e nis rifreskimin kur një gjenerim është në punë: gjenerimi ndërpritet dhe duhet nisur nga e para.

## Backup

Gjithë të dhënat janë te `storage/` dhe `backend/.env`. P.sh. një backup ditor me cron:

```bash
crontab -e
# shto këtë rresht:
0 3 * * * tar czf /root/backup-site-generator-$(date +\%F).tar.gz -C /var/www/site-generator storage backend/.env
```

Edhe Snapshot-et e VPS-it te hPanel janë një mbrojtje e mirë.

## Probleme të shpeshta

| Problemi | Zgjidhja |
|---|---|
| `502 Bad Gateway` | Aplikacioni nuk punon. Shiko `pm2 logs site-generator`. |
| `413 Request Entity Too Large` kur ngarkon kit-in | Rrit `client_max_body_size` te nginx, pastaj `systemctl reload nginx`. |
| `Refusing to listen ... without APP_PASSWORD` | Ke vënë `HOST=0.0.0.0` pa `APP_PASSWORD`. Vendose fjalëkalimin, ose përdor `HOST=127.0.0.1` me nginx. |
| Gabim me `node:sqlite` | Node është shumë i vjetër. Duhet ≥ 22.13 (`node -v`). |
| API key-t nuk punojnë pas migrimit | `ENCRYPTION_KEY` ka ndryshuar. Rikthe atë të vjetrin, ose futi key-t përsëri. |
| Nuk kërkohet login | `APP_PASSWORD` mungon te `backend/.env`. Shtoje dhe bëj `pm2 restart site-generator`. |
