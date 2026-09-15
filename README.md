# EESA – Egerton Engineering Student Association

A professional web portal for the Egerton Engineering Student Association. Features a public-facing website and an authenticated member portal.

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14 (App Router), Tailwind CSS |
| Backend    | Express.js, Mongoose                |
| Database   | MongoDB Atlas                       |
| Auth       | JWT (jsonwebtoken + bcryptjs)       |
| Uploads    | Cloudinary + Multer                 |
| Email      | Brevo REST API + SMTP fallback      |
| Payments   | M-Pesa Daraja API (STK Push)        |
| Hosting    | Vercel (frontend), Render (backend) |

## Project Structure

```
EESA2/
├── backend/            # Express API server
│   ├── config/         # Database configuration
│   ├── middleware/      # Auth middleware (JWT, roles)
│   ├── models/         # Mongoose schemas
│   ├── routes/         # API route handlers
│   ├── server.js       # Entry point
│   ├── seed.js         # Seed admin user
│   ├── render.yaml     # Render deployment blueprint
│   └── .env.example    # Environment variables template
├── frontend/           # Next.js application
│   ├── src/
│   │   ├── app/        # App Router pages
│   │   │   ├── portal/ # Authenticated member portal
│   │   │   └── ...     # Public pages
│   │   ├── components/ # Reusable React components
│   │   └── lib/        # API client & auth context
│   ├── vercel.json     # Vercel deployment config
│   └── .env.example    # Environment variables template
├── package.json        # Root scripts (install, dev, seed)
└── README.md
```

## Features

### Public Website
- Home page with hero, stats, upcoming events, and projects
- About page with mission, values, leadership, and departments
- Department pages for each discipline: overview, specialisations, coursework, careers and professional registration, linked from the About page and footer
- Events listing and detail pages with cover images, photo galleries and RSVP
- Project showcase
- News and articles
- Contact form

### Member Portal
- Dashboard with stats and upcoming events
- Profile management
- Elections: self-nomination with admin approval, secret ballot, automatic scheduling, results published when voting closes
- Payments (M-Pesa STK Push, manual receipt upload)
- Library: folders by Year › Semester › Unit › Type, multi-file upload that reads each file to suggest where it belongs, in-app preview (PDF, Word, PowerPoint, Excel, images), review with uploader notifications, private file storage, and units managed from the portal
- Gallery: albums with search, category filters and sorting; a masonry photo grid with a full-screen viewer, shareable links to albums and single photos, and downloads; office holders bulk-upload by drag and drop (photos are resized in the browser first), caption, reorder and choose a cover
- Sponsors management
- Notifications
- Member directory with search
- Light, dark and system themes

### Roles
| Role       | Permissions                                                |
|------------|------------------------------------------------------------|
| `member`   | View content, RSVP, update profile, vote, upload payments  |
| `leader`   | Create/edit events, news, projects, manage elections        |
| `admin`    | Full control: manage users, roles, all content, approvals   |

---

## Quick Start (Local Development)

### Prerequisites
- **Node.js** ≥ 18 — [download](https://nodejs.org)
- **MongoDB** — [Atlas (free)](https://www.mongodb.com/cloud/atlas) or local install
- **Cloudinary** account — [sign up (free)](https://cloudinary.com)
- **Brevo** account — [sign up (free)](https://www.brevo.com) *(for emails)*

### 1. Clone the repository
```bash
git clone https://github.com/your-username/EESA2.git
cd EESA2
```

### 2. Install all dependencies
```bash
npm install
```
This installs root, backend, and frontend dependencies in one command.

### 3. Configure environment variables

**Backend** — copy the template and fill in your values:
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/eesa
JWT_SECRET=change_this_to_a_long_random_string
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Brevo Email
BREVO_API_KEY=your_brevo_api_key
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_pass
SMTP_FROM=your_email@example.com

# M-Pesa (optional)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORTCODE=your_shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=http://localhost:5000/api/payments/mpesa/callback
```

**Frontend** — copy the template:
```bash
cd ../frontend
cp .env.example .env
```

`frontend/.env` should contain:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### 4. Seed the admin user
Set the administrator's email in `backend/.env`, then run the seed:
```env
SEED_ADMIN_EMAIL=you@example.com
SEED_ADMIN_PASSWORD=          # optional; leave empty to generate one
```
```bash
npm run seed
```
If `SEED_ADMIN_PASSWORD` is empty, a strong password is generated and printed once. Sign in and change it from your profile. Running the seed again never resets an existing account's password.

### 5. Start both servers

Open **two terminals**:

**Terminal 1 – Backend:**
```bash
npm run dev:backend
```
Backend runs on `http://localhost:5000`

**Terminal 2 – Frontend:**
```bash
npm run dev:frontend
```
Frontend runs on `http://localhost:3000`

Open `http://localhost:3000` in your browser.

---

## Testing

The backend has an API test suite covering authentication, authorisation and input safety. It runs against an in-memory MongoDB, so it never touches your real database.

```bash
cd backend
npm test
```

## How elections work

1. An admin or the chairperson creates an election with its positions, an optional nomination deadline, and voting open and close times.
2. While nominations are open, any active member can apply for one position with a manifesto and an optional photo. Admins can also add candidates directly.
3. An admin approves or rejects each application. Rejections need a reason, and the applicant is notified and can resubmit while nominations are open.
4. Voting opens and closes automatically at the scheduled times. Admins can also open or close voting early.
5. Every active member can vote once per position. Votes are stored separately from candidates and are never included in API responses, so no one can see who voted for whom.
6. Results, including turnout, percentages, winners and ties, are hidden from everyone until voting closes.

Elections created before this version keep their candidates and vote counts.

## Upgrading an existing deployment

Earlier versions HTML-escaped text as it was saved, so names such as O'Brien were stored as `O&#x27;Brien`. After deploying this version, repair existing records once:

```bash
cd backend
npm run migrate:unescape -- --dry-run   # preview the changes
npm run migrate:unescape                # apply them
```

The script is idempotent, so running it twice is safe. Other changes to be aware of:

- Passwords now need at least 8 characters, including a letter and a number. Existing passwords keep working until they are next changed.
- Changing a password signs the member out of every other device.
- The member directory API now requires a signed-in member.
- Only the `admin` role can change roles; the chairperson can still deactivate and restore ordinary members.
- `JWT_SECRET` must be at least 32 characters when `NODE_ENV=production`.

### Gallery albums

The gallery is now organised into albums, and the `/api/gallery` endpoints have changed to match (see `backend/routes/gallery.js`). Move the photos from the old gallery once after deploying:

```bash
cd backend
npm run migrate:gallery               # preview
npm run migrate:gallery -- --apply    # move them
```

Each category the old gallery used becomes one album, for example `/gallery/events-archive`, which office holders can rename, caption and reorder from Portal › Gallery. Files are not moved in Cloudinary, and the old `galleries` collection is left in place until you drop it. The script skips photos it has already moved, so it is safe to run again.

Gallery photos upload one request per file and have their own rate limit, `GALLERY_UPLOAD_RATE_LIMIT_MAX` (default 600 per 15 minutes per IP), so a large batch does not use up the general request budget.

## Deployment

### Backend → Render

1. Push the repo to GitHub.
2. In [Render](https://render.com), create a **New Web Service** from the repo.
3. Set **Root Directory** to `backend`.
4. **Build Command:** `npm install`
5. **Start Command:** `node server.js`
6. Add all environment variables from `backend/.env.example` with production values.
7. Set `FRONTEND_URL` to your Vercel frontend URL (e.g. `https://eesa-en.vercel.app`).

### Frontend → Vercel

1. Import the repo in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api`
4. Deploy.

### Environment Variables Checklist (Production)

| Variable | Where | Example |
|----------|-------|---------|
| `MONGODB_URI` | Render | `mongodb+srv://...` |
| `JWT_SECRET` | Render | At least 32 random characters |
| `FRONTEND_URL` | Render | `https://eesa-en.vercel.app` |
| `NODE_ENV` | Render | `production` |
| `CLOUDINARY_CLOUD_NAME` | Render | Your Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Render | Your Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Render | Your Cloudinary API secret |
| `BREVO_API_KEY` | Render | Your Brevo API key |
| `SMTP_HOST` | Render | `smtp-relay.brevo.com` |
| `SMTP_PORT` | Render | `587` |
| `SMTP_USER` | Render | Your Brevo SMTP user |
| `SMTP_PASS` | Render | Your Brevo SMTP password |
| `SMTP_FROM` | Render | Your sender email |
| `MPESA_*` | Render | Your Daraja API credentials |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://your-backend.onrender.com/api` |
| `NEXT_PUBLIC_SITE_URL` | Vercel | `https://eesa-en.vercel.app` |
| `SEED_ADMIN_EMAIL` | Local, when seeding | Administrator's email |

---
