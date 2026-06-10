# Deka Lens Next.js

เว็บนี้สร้างจากแนวคิดใน `streamlit_app.py` เป็น Next.js App Router + Tailwind CSS

## ติดตั้ง

```bash
corepack pnpm install
```

## รัน

```bash
corepack pnpm dev
```

เปิด `http://localhost:3000`

ถ้าต้องการรัน production server แบบเดียวกับโหมด deploy:

```bash
corepack pnpm build
corepack pnpm start:standalone
```

## Deploy จริง: Docker + Nginx + Cloudflare Tunnel (Host)

โครง deploy ที่ใช้จริง:

`Cloudflare Tunnel -> Nginx (Docker) -> Next.js (Docker)`

ในโครงนี้ `Nginx` จะเปิดเฉพาะ `127.0.0.1:18080` บนเครื่อง server เท่านั้น และให้ `cloudflared` ที่รันบน host เป็นทางเข้าเดียวจากภายนอก

### 1) รันแอปด้วย Docker Compose

```bash
docker compose up --build -d
```

ตรวจว่า compose ถูกต้อง:

```bash
docker compose config
```

ตรวจว่า origin ตอบบนเครื่องเดียวกัน:

```bash
curl http://127.0.0.1:18080
curl "http://127.0.0.1:18080/api/search?q=เงินกู้"
```

### 2) ติดตั้ง Cloudflare Tunnel บน Debian/Ubuntu

ติดตั้ง `cloudflared` บน host:

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloudflare-main.gpg
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update
sudo apt install -y cloudflared
```

ล็อกอิน Cloudflare:

```bash
cloudflared tunnel login
```

สร้าง tunnel:

```bash
cloudflared tunnel create <TUNNEL_NAME>
```

ผูก DNS:

```bash
cloudflared tunnel route dns <TUNNEL_NAME> <YOUR_SUBDOMAIN_OR_DOMAIN>
```

### 3) ตั้งค่า ingress ให้ชี้เข้า Nginx

คัดลอกไฟล์ตัวอย่าง:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp cloudflared/config.yml.example /etc/cloudflared/config.yml
```

แก้ค่าเหล่านี้ใน `/etc/cloudflared/config.yml`:

- `YOUR_TUNNEL_ID`
- `deka.example.com`
- path ของ credentials file ที่ได้จาก `cloudflared tunnel create`

ค่าหลักที่ต้องได้สุดท้าย:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: <your-domain>
    service: http://localhost:18080
  - service: http_status:404
```

### 4) ทำให้ cloudflared ติดขึ้นเองหลัง reboot

คัดลอก unit file ตัวอย่าง:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin cloudflared
sudo cp deploy/cloudflared.service.example /etc/systemd/system/cloudflared.service
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared
```

เช็กสถานะ:

```bash
sudo systemctl status cloudflared
journalctl -u cloudflared -f
```

### 5) เข้าใช้งานผ่านโดเมน Cloudflare

เมื่อ tunnel พร้อมแล้ว ให้เปิดโดเมนที่ผูกไว้กับ tunnel จากภายนอกได้ทันที โดย origin จริงยังคงเป็น `http://localhost:18080`

## การดูแลระบบ

ดู log ของแต่ละส่วน:

```bash
docker compose logs -f deka-lens
docker compose logs -f nginx
journalctl -u cloudflared -f
```

restart ทีละส่วน:

```bash
docker compose restart deka-lens
docker compose restart nginx
sudo systemctl restart cloudflared
```

ตรวจว่า tunnel ยังชี้เข้า origin ถูกต้อง:

```bash
curl http://127.0.0.1:18080
cloudflared tunnel list
cloudflared tunnel info <TUNNEL_NAME>
```

## หมายเหตุเรื่อง cache

`nginx` cache ไฟล์ static ของ Next.js แบบยาว และ cache `/api/search` แบบสั้นเพียง 2 นาทีเพื่อลดโหลดเว็บต้นทาง แต่ไม่ปล่อยให้ผลค้นหาเก่าค้างนานเกินไป ฝั่ง browser จะไม่ cache endpoint นี้เพราะตอบ `Cache-Control: no-store`

## หยุดระบบ

หยุดเฉพาะแอป:

```bash
docker compose down
```

หยุด tunnel:

```bash
sudo systemctl stop cloudflared
```

## ไฟล์หลัก

- `app/page.tsx`: Client Component สำหรับ UI ค้นหาและบันทึกโน้ต
- `app/api/search/route.ts`: API Route รวมผลค้นหาฝั่ง server เพื่อลดปัญหา CORS
- `lib/search.ts`: logic ประกอบคำค้น แหล่งค้น และ parser
- `nginx/nginx.conf`: reverse proxy และ cache policy
- `cloudflared/config.yml.example`: ตัวอย่าง config สำหรับ Cloudflare Tunnel บน host
- `deploy/cloudflared.service.example`: ตัวอย่าง systemd service สำหรับ `cloudflared`
