# Photography Studio QR Gallery Platform

A mobile-first, full-stack platform that lets photography studios deliver personalized photo and video galleries to customers via QR codes. Studio owners upload media, organise it into nested galleries and folders, and generate secure QR codes. Customers scan the code, authenticate with a phone OTP, and view their content inside a Flutter app on iOS or Android.

---

## Repository Structure

```
studio-gallery/
├── apps/
│   ├── backend/     # NestJS API — Prisma, PostgreSQL, JWT, Swagger
│   └── mobile/      # Flutter app — Riverpod, GoRouter, Hive, Firebase
├── .gitignore
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Mobile** | Flutter (latest stable), Riverpod, GoRouter, Dio, Hive, Firebase Messaging |
| **Backend** | NestJS, Prisma ORM, PostgreSQL, JWT (HS256), Swagger / OpenAPI |
| **Media** | Cloudinary (storage, CDN, signed URLs, transformations) |
| **Auth** | Firebase Phone Authentication (OTP) + Firebase Cloud Messaging (FCM) |
| **Infrastructure** | Docker, docker-compose, PostgreSQL 15 |

---

## Prerequisites

| Tool | Minimum Version |
|---|---|
| Node.js | 20 LTS |
| npm | 10 |
| Flutter SDK | latest stable |
| Docker + docker-compose | Docker 24, Compose v2 |
| PostgreSQL (via Docker) | 15-alpine |

---

## Setup Instructions

### 1. Clone and enter the repo

```bash
git clone <repo-url>
cd studio-gallery
```

### 2. Backend (NestJS)

```bash
cd apps/backend

# Install dependencies
npm install

# Copy environment template and fill in your values
cp .env.example .env

# Start PostgreSQL with Docker
docker-compose up -d postgres

# Apply database migrations
npx prisma migrate deploy

# Start the development server
npm run start:dev
```

The API will be available at `http://localhost:3000/api/v1`.  
Swagger UI (non-production only): `http://localhost:3000/api/docs`

### 3. Mobile (Flutter)

```bash
cd apps/mobile

# Fetch Dart/Flutter dependencies
flutter pub get

# Generate code (Hive adapters, etc.)
dart run build_runner build --delete-conflicting-outputs

# Configure Firebase
# Run `flutterfire configure` and follow the prompts, or copy your
# google-services.json (Android) and GoogleService-Info.plist (iOS)
# into the appropriate platform directories.

# Run on a connected device or emulator
flutter run
```

### 4. Running the full stack with Docker Compose

```bash
cd apps/backend
docker-compose up --build
```

This starts both the NestJS backend and the PostgreSQL 15 database in one command.

---

## Environment Variables

Copy `apps/backend/.env.example` to `apps/backend/.env` and populate each variable.  
See the example file for descriptions of all required variables (no real secrets are committed).

---

## Running Tests

```bash
# Backend unit + e2e tests
cd apps/backend
npm test

# Backend tests with coverage
npm run test:cov

# Flutter tests
cd apps/mobile
flutter test
```

---

## MVP Scope

The initial release targets the first 10 photography studios and covers:

- Phone OTP authentication for studio owners and customers
- Customer and gallery management
- Nested folder organisation (up to 5 levels)
- Photo and video upload via Cloudinary
- QR code generation and deep-link scanning
- Push notifications via Firebase Cloud Messaging
- Basic gallery analytics

Out of scope for MVP: booking, subscriptions, payments, admin web panel, invoicing, advanced analytics.
