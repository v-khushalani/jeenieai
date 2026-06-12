# 🚀 JEEnie AI — AI-Powered JEE & NEET Preparation Platform

A comprehensive, full-stack learning platform for competitive exam preparation featuring AI-powered doubt solving, adaptive practice, gamification, and complete management tools for educators and admins.

**Website**: [jeenie.website](https://jeenie.website)  
**Status**: ✅ Production Ready | **Version**: 1.2.0

---

## ✨ Core Features

### 🎓 Student Learning Platform
- **🤖 AI Doubt Solver** — Real-time AI assistance powered by Google Gemini with advanced KaTeX math rendering
- **📚 Adaptive Practice** — Smart question filtering by chapter, topics, difficulty, and subject
- **📝 Full Mock Tests** — Complete exam-pattern tests with detailed results and review flow
- **📊 Analytics Dashboard** — Visual performance tracking with mastery and accuracy metrics
- **🎯 Goal Tracking & Daily Limits** — Personalized study goals with tier-based question limits (Free/Pro/Pro+)
- **🔥 Streak & Reward System** — Point-based streaks, badges, and gamification elements
- **📱 Cross-Platform** — React + PWA for web, Capacitor for native Android/iOS
- **🌙 Theme Support** — Light/Dark mode with system preference detection

### 👨‍🏫 Educator Dashboard
- **📄 Batch Management** — Organize and structure student groups by exam and class level
- **📖 Content Creation** — Manage chapters, topics, and question banks
- **📋 Group Tests** — Create and share tests via QR codes and join links
- **📊 Student Analytics** — Track batch performance, individual progress, and mastery metrics
- **🔍 Question Management** — Import, edit, and organize questions from multiple sources

### 🛡️ Admin Panel
- **👥 User & Role Management** — Control access levels for admins, educators, and students
- **🏛️ Content Management** — Comprehensive batch structure with synced JEE/NEET curriculum
  - JEE Standard: Physics (21), Chemistry (17), Mathematics (19) chapters
  - NEET Standard: Physics (12), Chemistry (25), Biology (16) chapters  
  - Foundation Programs: 6-10 grade curriculum
- **📥 PDF Question Import** — AI-assisted bulk question extraction from PDFs
- **🔔 Notifications & Announcements** — Targeted communication with users
- **🔧 Feature Flags & Experiments** — Controlled A/B testing and feature rollouts

---

## 🛠️ Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Frontend** | React 18 + TypeScript + Vite + Tailwind CSS + Radix UI |
| **Backend** | Supabase (PostgreSQL + Edge Functions + Auth) |
| **AI/ML** | Google Gemini API + OpenAI API |
| **Payments** | Razorpay integration |
| **Mobile** | Capacitor (Android 8.2.0 / iOS 8.2.0) + PWA |
| **Testing** | Vitest + Playwright + @testing-library |
| **Build & Deploy** | Vite + Gzip compression + Vercel |
| **State Management** | React Context + TanStack React Query |
| **UI Components** | Radix UI + Recharts + Embla Carousel |

---

## ⚙️ Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- **Git** for version control
- **Supabase Project** (self-hosted or cloud)
- **API Keys** (optional for AI features):
  - Google Gemini API Key
  - OpenAI API Key
  - Razorpay API credentials

---

## 🚀 Installation & Setup

### 1. Clone and Install
```bash
git clone https://github.com/v-khushalani/jeenieapp.git
cd jeenieapp
npm install
```

### 2. Environment Configuration
```bash
# Copy environment template (if available)
cp .env.example .env.local

# Add your credentials
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your_anon_key_here"
VITE_RAZORPAY_KEY_ID="your_razorpay_key"
```

**Note**: Sensitive backend keys (Gemini API, OpenAI API, Razorpay Secret) should be added via Supabase environment variables/secrets, not in `.env.local`.

### 3. Start Development Server
```bash
npm run dev
# Server runs at http://localhost:5173 (Vite default)
```

---

## 📚 NPM Commands

### Development
```bash
npm run dev              # Start Vite dev server with hot reload
npm run preview          # Build and preview production bundle
```

### Build & Deploy
```bash
npm run build            # Create optimized production build
npm run build:dev        # Build in development mode
```

### Code Quality
```bash
npm run lint             # Run ESLint on all files
npm run typecheck        # TypeScript type checking
npm run check            # Run lint + typecheck together
```

### Testing
```bash
npm test                 # Run Vitest in watch mode
npm run test:run         # Single run of all tests
npm run test:ui          # Interactive test UI
npm run test:coverage    # Coverage report

npm run e2e              # Run Playwright end-to-end tests
npm run e2e:ui           # Playwright test UI
npm run e2e:report       # View test report
```

### Data Management
```bash
npm run repair:chapters  # Fix skewed chapter assignments
npm run report:mapping   # Generate curriculum mapping report
```

---

## 📁 Project Directory Structure

```
.
├── public/                          # Static assets & PWA manifest
│   ├── manifest.json
│   ├── pwa-*.png                    # PWA icons
│   └── robots.txt
│
├── src/
│   ├── pages/                       # Route pages & layouts
│   │   ├── Index.tsx                # Landing/Home
│   │   ├── Login.tsx                # Authentication
│   │   ├── StudyNowPage.tsx         # Main study interface
│   │   ├── PracticePage.tsx         # Topic practice
│   │   ├── TestPage.tsx             # Full-length mock tests
│   │   ├── TestAttemptPage.tsx      # Test taking interface
│   │   ├── TestResultsPage.tsx      # Result analysis
│   │   ├── AnalyticsPage.tsx        # Performance dashboard
│   │   ├── AdminDashboard.tsx       # Admin panel
│   │   ├── EducatorDashboard.tsx    # Teacher panel
│   │   ├── SubscriptionPlans.tsx    # Pricing page
│   │   ├── AIStudyPlannerPage.tsx   # AI study scheduler
│   │   ├── BadgesPage.tsx           # Achievements
│   │   ├── DiagnosticQuizPage.tsx   # Level assessment
│   │   ├── CreateGroupTestPage.tsx  # Test creation
│   │   ├── JoinGroupTestPage.tsx    # Test joining
│   │   └── [more pages...]
│   │
│   ├── components/                  # Reusable components
│   │   ├── ui/                      # Radix UI primitives (Button, Dialog, etc.)
│   │   ├── admin/                   # Admin-specific components
│   │   │   ├── BatchManager.tsx     # Batch CRUD
│   │   │   ├── ChapterManager.tsx   # Chapter/topic management
│   │   │   └── [more...
│   │   ├── educator/                # Educator tools
│   │   ├── games/                   # Gamification components
│   │   ├── gamification/            # Badges, leaderboards
│   │   ├── landing/                 # Hero, features, pricing sections
│   │   ├── mobile/                  # Mobile-responsive layouts
│   │   ├── simulations/             # Physics/Chemistry labs
│   │   ├── study-planner/           # AI study scheduler
│   │   ├── virtual-lab/             # Interactive experiments
│   │   ├── __tests__/               # Component tests
│   │   ├── RouteTracker.tsx         # Navigation wrapper
│   │   ├── Header.tsx               # App header
│   │   ├── ErrorBoundary.tsx        # Error handling
│   │   ├── ProtectedRoute.tsx       # Auth guards
│   │   ├── FeatureGate.tsx          # Feature flags
│   │   ├── AIDoubtSolver.tsx        # AI assistance UI
│   │   ├── Leaderboard.tsx          # Rankings
│   │   ├── PeerComparison.tsx       # Peer analytics
│   │   └── [more components...]
│   │
│   ├── hooks/                       # Custom React hooks
│   │   ├── use-mobile.tsx           # Mobile detection
│   │   ├── use-toast.ts             # Toast notifications
│   │   ├── useAutoSubscribePush.ts  # Push notifications
│   │   ├── useAdminAuth.tsx         # Admin auth check
│   │   └── [more hooks...]
│   │
│   ├── services/                    # API & backend services
│   │   ├── api.ts                   # Main API client
│   │   ├── supabase.ts              # Supabase initialization
│   │   └── [service modules...]
│   │
│   ├── contexts/                    # React Context & Providers
│   │   ├── AuthContext.tsx          # Authentication state
│   │   ├── FeatureFlagContext.tsx   # Feature flags
│   │   └── index.ts
│   │
│   ├── config/                      # App configuration
│   │   ├── examPatterns.ts          # Test patterns
│   │   ├── goalConfig.ts            # Study goals
│   │   ├── jeePublisherCurricula.ts # Curriculum data
│   │   ├── studySystem.ts           # Study parameters
│   │   └── subscriptionPlans.ts     # Pricing tiers
│   │
│   ├── constants/                   # Shared constants
│   │   └── unified.ts               # Unified constants
│   │
│   ├── types/                       # TypeScript interfaces
│   │   └── [type definitions...]
│   │
│   ├── lib/                         # Utility libraries
│   │   └── lazyWithRetry.ts         # Code splitting helper
│   │
│   ├── utils/                       # Helper functions
│   │   └── [utility modules...]
│   │
│   ├── integrations/                # External integrations
│   │   └── [integration modules...]
│   │
│   ├── App.tsx                      # Root component & routing
│   ├── main.tsx                     # Entry point
│   ├── sw.ts                        # Service Worker (PWA)
│   ├── index.css                    # Global styles
│   └── vite-env.d.ts               # Vite type definitions
│
├── supabase/                        # Backend configuration
│   ├── functions/                   # Supabase Edge Functions
│   ├── migrations/                  # Database migrations & schema
│   └── config.toml                  # Supabase project config
│
├── e2e/                             # Playwright end-to-end tests
│   └── [test scenarios...]
│
├── scripts/                         # Data management scripts
│   ├── assign-topics-nlp.mjs
│   ├── bulk-assign-topics.mjs
│   ├── check-topic-mismatch.mjs
│   ├── fix-invalid-topics.mjs
│   ├── populate-topic-names.mjs
│   ├── reassign-skewed-chapters.mjs
│   ├── report-mapping-coverage.mjs
│   └── [more data scripts...]
│
├── public/                          # Static assets
│   ├── manifest.json                # PWA manifest
│   ├── pwa-*.png                    # PWA icons
│   ├── robots.txt
│   └── sitemap.xml
│
├── tailwind.config.ts               # Tailwind CSS config
├── vite.config.ts                   # Vite bundler config
├── vitest.config.ts                 # Vitest test config
├── tsconfig.json                    # TypeScript config
├── eslint.config.js                 # ESLint rules
├── package.json                     # Dependencies
└── README.md                        # This file
```

---

## 🔑 Key Components & Pages

### Student Pages
- **StudyNowPage** — Main study interface with chapter selection
- **PracticePage** — Practice questions with filtering and difficulty adjustment
- **TestPage** — Browse and attempt full-length mock tests
- **TestAttemptPage** — Live test taking with timer
- **TestResultsPage** — Detailed result analysis and review
- **AnalyticsPage** — Performance metrics and progress tracking
- **SubscriptionPlans** — Subscription management and upgrade flow
- **AIStudyPlannerPage** — AI-powered personalized study schedule
- **BadgesPage** — Achievement and reward display

### Educator Pages
- **EducatorDashboard** — Batch management and student monitoring
- **CreateGroupTestPage** — Test creation interface
- **JoinGroupTestPage** — Student test joining mechanism
- **GroupTestLeaderboard** — Test rankings and scores

### Admin Pages
- **AdminDashboard** — Main admin control center
- **Content Management** — Batch and chapter structure editor

### Core Routes
- **Index** — Landing page with hero and features
- **Login/Signup** — Authentication pages
- **Settings** — User preferences and account
- **Profile** — User profile management

---

## 🎯 Curriculum Standards

### JEE Standard (11th & 12th)
- **Physics**: 21 chapters (Mechanics, Thermodynamics, Electromagnetism, etc.)
- **Chemistry**: 17 chapters (Organic, Inorganic, Physical Chemistry)
- **Mathematics**: 19 chapters (Algebra, Calculus, Trigonometry, etc.)

### NEET Standard (11th & 12th)
- **Physics**: 12 chapters
- **Chemistry**: 25 chapters
- **Biology**: 16 chapters

### Foundation Program (6th-10th Grade)
- Comprehensive curriculum for grades 6-10 with 8 chapters per subject

*Each chapter comes with 5 default topics.*

---

## 💳 Subscriptions, Payments & Promo Codes

### Plans (DB-driven — `subscription_plans` table is the single source of truth)
| Plan | Tier | Price | MRP | Duration |
|------|------|-------|-----|----------|
| JEEnie Pro Monthly | `pro` | ₹499 | ₹999 | 30 days |
| JEEnie Pro Yearly | `pro` | ₹899 | ₹1499 | 365 days |
| JEEnie Pro+ Monthly | `pro_plus` | ₹349 | — | 30 days |
| JEEnie Pro+ Yearly | `pro_plus` | ₹1799 | ₹2999 | 365 days |

Admins edit prices / features in `Admin Dashboard → Subscriptions → Plans` — changes propagate immediately to Razorpay order amounts (server reads from DB on each order).

### Razorpay Flow
1. Client calls `create-razorpay-order` edge function (passes `planId` + optional `promoCode`).
2. Edge function loads plan from DB, revalidates promo via `validate_promo_code` RPC, computes final amount **server-side**, creates Razorpay order, inserts `payments` row.
3. Razorpay checkout opens; on success client calls `verify-payment` edge function.
4. `verify-payment` verifies HMAC signature, checks ownership, sets `profiles.is_premium=true` + `subscription_end_date`, records `promo_redemptions`, grants referrer reward if applicable.

### Promo Codes
- Managed in `Admin Dashboard → Subscriptions → Promo Codes`.
- Per-plan restrictions (`applicable_plan_ids`), max redemptions (global + per user), min amount, expiry, percent or flat discount.
- Users never SELECT `promo_codes` directly; validation goes through `validate_promo_code` SECURITY DEFINER RPC (rate-limited at edge).
- HELLOJEENIE-style launch codes work end-to-end including server-side revalidation at checkout.

---

## 🔐 Security & Access Control

### Authentication
- **Supabase Auth** with email/password and OAuth support
- JWT-based session management
- Secure password reset with email verification

### Authorization & RBAC
- **Row-Level Security (RLS)** on all data tables
- Roles stored in dedicated `user_roles` table (never on `profiles`) and checked via `has_role()` SECURITY DEFINER function — prevents privilege escalation.
- Role values: `admin`, `super_admin`, `educator`, `student`.

### Hardened Tables (audit pass — May 2026)
- `topic_mastery` — owner SELECT only; all writes go through `upsert_topic_mastery` RPC.
- `referrals` — column-level `REVOKE SELECT (referred_email)` from authenticated/anon; client reads via `referrals_safe` view.
- `promo_codes` — admin-only SELECT; users hit `validate_promo_code` RPC instead of reading the table.
- `payments`, `promo_redemptions` — owner SELECT; mutations only via service-role edge functions.
- Edge functions never trust client-supplied amounts — Razorpay order amount is always recomputed from DB.

### Data Protection
- HTTPS-only communication
- Razorpay HMAC signature verification on every payment
- Promo validation rate-limited per user
- No secrets in DB or client code — all in Supabase function env vars


---

## 🚀 Deployment

### Build for Production
```bash
npm run build
# Output: dist/ folder ready for deployment
```

### Deploy to Vercel
```bash
# Push to GitHub
git push origin main

# Vercel auto-deploys from main branch
# See vercel.json for deployment config
```

### Deploy to Other Platforms
- **Netlify**: `npm run build` → Deploy `dist/` folder
- **Docker**: Create Dockerfile with Node 18 base image
- **Self-hosted**: Node server + Nginx reverse proxy

---

## 📊 Database Schema

Key tables in Supabase PostgreSQL:
- `profiles` — user info, premium status, subscription end date, streaks
- `user_roles` — role assignments (separate from profiles, prevents escalation)
- `batches` / `subjects` / `units` / `chapters` / `topics` — curriculum hierarchy
- `questions` — practice questions (1.9k seeded; HF importer ready for 97k)
- `question_attempts` — every attempt with correctness, time, mode
- `topic_mastery` — per-user per-topic mastery (write-protected, RPC-only)
- `test_sessions` / `group_tests` — mock test + group test state
- `subscription_plans` — pricing source of truth (read by Razorpay edge functions)
- `payments` / `promo_codes` / `promo_redemptions` — billing
- `referrals` (+ `referrals_safe` view) — referral tracking with email column locked down
- `feature_flags` — gradual rollout / A/B
- `import_jobs` — HuggingFace dataset import status
- `badges` / `user_badges` / `points_log` / `daily_progress` — gamification
- `admin_notifications` / `push_subscriptions` — comms

Key RPCs:
- `has_role(uuid, app_role)` — role check (used in all RLS policies)
- `validate_promo_code(code, plan_id, user_id)` — server-side promo validation
- `upsert_topic_mastery` — only path to write mastery
- `update_streak_stats` / `sync_daily_progress` — streak & daily progress
- `get_leaderboard_with_stats` — leaderboard


---

## 🧪 Testing

### Unit Tests
```bash
npm run test           # Watch mode
npm run test:run       # Single run
npm run test:coverage  # With coverage report
```

### End-to-End Tests  
```bash
npm run e2e           # Run all scenarios
npm run e2e:ui        # Interactive test UI
npm run e2e:report    # View test report
```

### Test Files Location
- Unit tests: `src/components/__tests__/`
- E2E tests: `e2e/`

---

## 📝 API Integration

### Supabase Setup
1. Create a new Supabase project
2. Set up authentication with email/password
3. Create tables using migrations in `supabase/migrations/`
4. Configure RLS policies for each table
5. Deploy Edge Functions from `supabase/functions/`

### Environment Variables Checklist
- [ ] `VITE_SUPABASE_URL` — Project URL
- [ ] `VITE_SUPABASE_ANON_KEY` — Anon key from API settings
- [ ] `VITE_RAZORPAY_KEY_ID` — Razorpay merchant ID (if using payments)

Backend secrets (via Supabase dashboard):
- [ ] `GEMINI_API_KEY` — Google Gemini API
- [ ] `OPENAI_API_KEY` — OpenAI API (optional)
- [ ] `RAZORPAY_KEY_SECRET` — Razorpay secret key

---

## 📱 PWA & Mobile Features

### Progressive Web App
- Installable on home screen (web)
- Offline functionality with service worker
- Background sync for submissions
- Push notifications
- App shell caching strategy

### Mobile Apps
- **Android**: Built with Capacitor 8.2.0
- **iOS**: Built with Capacitor 8.2.0
- Native plugins for camera, storage, notifications

### Mobile Navigation
- Bottom tab navigation on smaller screens
- Responsive design for all breakpoints
- Touch-optimized UI

---

## 🛠️ Development Workflow

### Guidelines
1. **Branch naming**: `feature/feature-name` or `bugfix/issue-name`
2. **Commits**: Clear, concise commit messages
3. **Pull requests**: Describe changes and link issues
4. **Code quality**: Must pass lint and typecheck
5. **Tests**: Write tests for new features

### Pre-commit Hooks
- ESLint auto-fix enabled via husky
- Type checking on staged files

### IDE Setup (VS Code)
Recommended extensions:
- **ES7+ React/Redux/React-Native snippets** (dsznajder.es7-react-js-snippets)
- **Tailwind CSS IntelliSense** (bradlc.vscode-tailwindcss)
- **TypeScript Vue Plugin** (Vue.volar)
- **Supabase** (supabase.supabase)

---

## 🐛 Troubleshooting

### Issue: "Subject not found" error
**Solution**: Supabase auto-creates subjects. Clear browser cache and refresh.

### Issue: Chapters show null values
**Solution**: Run the seed script to populate curriculum data.

### Issue: Build fails with TypeScript errors
**Solution**: 
```bash
npm run typecheck    # See error details
npm run fix          # Auto-fix where possible
```

### Issue: PWA not caching offline
**Solution**: Check service worker status in DevTools → Application tab.

---

## 📚 Documentation & Guides

Available in project root:
- **START_HERE.md** — Quick onboarding
- **QUICK_START_GUIDE.md** — Command reference
- **END_TO_END_TEST_GUIDE.md** — Comprehensive testing
- **TESTING_SUMMARY.md** — Test status overview
- **SOLUTION_GUIDE.md** — Architecture & implementation details
- **CHANGES_SUMMARY.md** — Recent code modifications

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details

---

## 📞 Support & Contact

- **Website**: [jeenie.website](https://jeenie.website)
- **Email**: support@jeenie.website
- **GitHub**: [v-khushalani/jeenieapp](https://github.com/v-khushalani/jeenieapp)

---

**Last Updated**: May 2026  
**Version**: 1.2.0  
**Status**: ✅ Production Ready

## 📋 Audit Log

### v1.2.0 — May 24, 2026
- 🛡️ **Security hardening**: locked down `topic_mastery` (SELECT-only RLS), revoked `referrals.referred_email` from authenticated/anon, removed broad `promo_codes` read policy. All 3 error-level security findings resolved.
- 💳 **Subscriptions**: DB-driven plans (`subscription_plans` table) — admin edits reflect in Razorpay instantly. Pro Monthly ₹499, Yearly ₹899; Pro+ Monthly ₹349, Yearly ₹1799.
- 🎟️ **Promo codes**: full admin CRUD, per-plan restrictions, server-side revalidation in both `validate-promo-code` and `create-razorpay-order` edge functions.
- 🧠 **Comparison UI**: removed PYQ row, swapped AI Doubt Solver counts for "Limited / Unlimited access".
- 🌐 **CORS**: edge functions now serve `*` origin for preview + published + Capacitor app.
- 📚 **Content readiness**: 1,961 seeded questions across 114 chapters; HuggingFace importer verified — ready to ingest 97k entrance-exam questions.

