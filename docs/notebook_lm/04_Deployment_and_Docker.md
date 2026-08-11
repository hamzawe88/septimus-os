# دليل النشر والتشغيل (Deployment & Docker)

نظام Septimus OS مصمم للعمل بتقنية الـ Containers (Docker-first) مما يجعله جاهزاً للاستضافة السحابية (Cloud-Native) أو على خوادم محلية (On-Premise).

## بنية الحاويات (Docker Containers)
يتكون النظام من عدة حاويات أساسية تُدار عبر `docker-compose.yml`:

1. **`frontend`**: حاوية واجهة Next.js.
   - البورت: `3000`.
   - تعتمد على الـ Backend عبر API.
2. **`backend-core`**: حاوية لغة Golang (المحرك الرئيسي).
   - البورت: `8080`.
   - تتعامل مع الـ Database و Redis.
3. **`db`**: حاوية قاعدة بيانات PostgreSQL.
   - البورت: `5432`.
   - يتم تخزين البيانات بشكل دائم عبر (Docker Volumes).
4. **`redis`**: حاوية Redis.
   - البورت: `6379`.
   - تستخدم للـ Caching وإدارة جلسات الـ WebSockets والتواصل السريع (Pub/Sub).
5. **`nats`**: نظام NATS Messaging (لتوسعة النظام).
   - البورت: `4222`.

## أوامر التشغيل الأساسية

### التشغيل لأول مرة
لبناء الحاويات وتشغيلها في الخلفية:
```bash
docker-compose up -d --build
```

### إيقاف النظام
لإيقاف جميع الحاويات دون مسح البيانات:
```bash
docker-compose down
```

### إعادة بناء الحاويات بعد التعديلات
بعد أي تعديل في الكود المصدري للواجهة (Frontend) أو (Backend)، يجب إعادة البناء:
```bash
docker-compose up -d --build frontend
docker-compose up -d --build backend-core
```

## المتغيرات البيئية (Environment Variables)
يتم تمرير المتغيرات البيئية عبر ملف `.env`. أهم المتغيرات تشمل:
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`: للاتصال بقاعدة البيانات.
- `JWT_SECRET`: مفتاح التشفير لرموز الدخول (Tokens).
- `REDIS_URL`: للاتصال بـ Redis.

## التوصيات للتبيئة الحقيقية (Production Readiness)
- ينصح بوضع النظام خلف **Nginx** أو **Traefik** للتعامل مع الـ SSL Certificates وتوجيه الـ Domains.
- يجب مراقبة استهلاك الحصص التخزينية المحددة لكل حاوية والتأكد من إعدادات الـ Backup لقاعدة البيانات.
