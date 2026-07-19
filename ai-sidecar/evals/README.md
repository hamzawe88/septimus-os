# Septimus OS — Evals (Arabic-first)

حزمة تقييم تقيس جودة إجابات الذكاء (RAG، تصنيف، تقدير، تكافؤ لغوي، دفاع ضد الحقن، منع الهلوسة) وتمنع التدهور الصامت عند تغيير نموذج أو prompt.

## الملفات
- `dataset.jsonl` — حالات التقييم (سطر JSON لكل حالة). قابلة للتوسيع بسهولة.
- `run_evals.py` — المُشغّل: يستدعي مسارات الذكاء الحيّة عبر البروكسي، يقيس الدقة والزمن، ويعطي رمز خروج للـ CI.

## التشغيل

```bash
# 1) شغّل الـ stack
docker compose up -d --build

# 2) اضبط مزوّد ذكاء في Settings → AI Providers (أو Ollama محلي بلا مفتاح)

# 3) مِن JWT اختبار بسرّ الـ backend (HS256، claims: sub / workspace_id / role / exp)
export EVAL_BASE_URL=http://localhost:4000/api/v1
export EVAL_JWT=<token>

# 4) شغّل
cd ai-sidecar/evals
python3 run_evals.py                    # كل الحالات، عتبة 85%
python3 run_evals.py --category language,injection
python3 run_evals.py --skip-seeded      # تخطَّ حالات RAG التي تحتاج فهرسة مسبقة
python3 run_evals.py --json report.json --threshold 0.8
```

> حالات `requires_seeded_knowledge: true` (فئة `rag`) تحتاج فهرسة مستندات المعمارية أولاً — استخدم `--skip-seeded` إن لم تُفهرسها بعد.

## أنواع التحقق (expect.type)
`is_arabic` · `is_english` · `contains_any` · `contains_all` · `regex` · `numeric_in` · `numeric_tolerance` · `must_refuse`

## إضافة حالة
أضف سطراً إلى `dataset.jsonl`:
```json
{"id":"crm-001","category":"classification","lang":"ar","endpoint":"/ai/chat","payload":{"message":"...","lang":"ar","agentType":"crm"},"expect":{"type":"contains_any","values":["..."]}}
```

## دمج CI (مقترح — أضِفه إلى `.github/workflows/ci.yml`)
```yaml
  evals:
    runs-on: ubuntu-latest
    if: ${{ vars.RUN_EVALS == 'true' }}   # اختياري: يحتاج stack + مفتاح ذكاء
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-python@v6
        with: { python-version: '3.11' }
      - run: pip install requests
      - env:
          EVAL_BASE_URL: ${{ secrets.EVAL_BASE_URL }}
          EVAL_JWT: ${{ secrets.EVAL_JWT }}
        run: python3 ai-sidecar/evals/run_evals.py --threshold 0.85 --skip-seeded
```

## التحقق (offline)
منطق التقييم مُختبَر بلا شبكة: `python3 -m py_compile run_evals.py` + اختبار دوال `score()`.
