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
- Events listing and detail pages with RSVP
- Project showcase
- News and articles
- Contact form

### Member Portal
- Dashboard with stats and upcoming events
- Profile management
- Elections (voting, candidate registration)
- Payments (M-Pesa STK Push, manual receipt upload)
- Library (resource sharing, reviews)
- Gallery (photo albums)
- Sponsors management
- Notifications
- Member directory

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
```bash
cd ..
npm run seed
```
This creates the default admin:
- **Email:** `admin@example.com` *(edit `backend/seed.js` to change)*
- **Password:** `Admin@2024`

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
| `JWT_SECRET` | Render | Long random string |
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

---
