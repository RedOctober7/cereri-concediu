# Cereri Concediu

Aplicație web pentru managementul cererilor de concediu de odihnă (firmă din România).

## Fază 1 — Fundație (completă)

- Next.js 16 + TypeScript strict
- Tailwind CSS 4 + shadcn/ui
- Prisma 6 + PostgreSQL (schema completă)
- NextAuth.js (Credentials, JWT 7 zile)
- Pagină login + schimbare parolă obligatorie la primul login
- Middleware protecție rute
- Seed administrator din variabile de mediu
- Rate limiting autentificare (in-memory MVP / Vercel KV opțional)

## Configurare locală

### 1. Variabile de mediu

Copiază `.env.example` în `.env.local` și completează valorile:

```bash
cp .env.example .env.local
```

Generează secrete:

```bash
openssl rand -base64 32   # NEXTAUTH_SECRET
openssl rand -hex 32      # CRON_SECRET (fazele următoare)
```

### 2. Bază de date Supabase

1. Creează un proiect Supabase.
2. Din **Settings → Database**, copiază:
   - **Connection string (Transaction pooler)** → `DATABASE_URL`
   - **Connection string (Direct)** → `DIRECT_URL`
3. Rulează migrarea:

```bash
npm run db:migrate
```

Sau aplică manual migrarea din `prisma/migrations/`.

### 3. Seed administrator

```bash
npm run db:seed
```

Creează userul `ADMIN_USERNAME` dacă nu există, cu `mustChangePassword: true`.

### 4. Pornire aplicație

```bash
npm run dev
```

Deschide [http://localhost:3000](http://localhost:3000) → redirect la `/login`.

**Credențiale implicite (din `.env.example`):**

- Utilizator: `admin`
- Parolă: valoarea din `ADMIN_PASSWORD`
- La primul login: schimbare parolă obligatorie → apoi panou `/admin`

## Scripturi utile

| Comandă | Descriere |
|---------|-----------|
| `npm run dev` | Server dezvoltare |
| `npm run build` | Build producție |
| `npm run db:migrate` | Migrări Prisma |
| `npm run db:seed` | Seed admin |
| `npm run db:studio` | Prisma Studio |

## Structură autentificare

| Rută | Acces |
|------|-------|
| `/login` | Public |
| `/schimba-parola` | Autentificat (parolă obligatorie) |
| `/dashboard`, `/cereri/*`, `/profil` | Angajat + Admin |
| `/admin/*` | Doar Admin |
| `/api/admin/*` | Doar Admin |

## Următorul pas

**Faza 2 — Admin Core:** CRUD puncte de lucru, utilizatori, constrângeri.
