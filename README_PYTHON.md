# Deka Lens Python Search Aggregator

## ติดตั้งบน Linux/Debian

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

ถ้าเครื่อง Debian ยังไม่มี dependency ของ browser:

```bash
playwright install-deps chromium
```

## วิธีรัน

```bash
source .venv/bin/activate
streamlit run streamlit_app.py
```

เปิด URL ที่ Streamlit แสดง เช่น `http://localhost:8501`
