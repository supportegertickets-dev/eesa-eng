# EESA – Egerton Engineering Student Association

A professional web portal for the Egerton Engineering Student Association. Features a public-facing website and an authenticated member portal.

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14 (App Router), Tailwind CSS |
| Backend    | Express.js, Mongoose                |
| Database   | MongoDB Atlas                       |
| Auth       | JWT (jsonwebtoken + bcryptjs)       |
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
│   └── render.yaml     # Render deployment blueprint
├── frontend/           # Next.js application
│   ├── src/
│   │   ├── app/        # App Router pages
│   │   │   ├── portal/ # Authenticated member portal
│   │   │   └── ...     # Public pages
│   │   ├── components/ # Reusable React components
│   │   └── lib/        # API client & auth context
│   └── vercel.json     # Vercel deployment config
└── README.md
```

## Features

### Public Website
- Home page with hero, stats, upcoming events, and projects
- About page with mission, values, leadership, and departments
- Events listing and detail pages
- Project showcase
- News and articles
- Contact form

### Member Portal
- Dashboard with stats and upcoming events
- Profile management
- Event RSVP
- Member directory
- Content management (admin/leadership)

### Roles
| Role       | Permissions                                   |
|------------|-----------------------------------------------|
| `member`   | View content, RSVP, update own profile        |
| `leader`   | Create/edit events, news, projects            |
| `admin`    | All leader permissions + manage users & roles  |

## Getting Started

### Prerequisites
- Node.js ≥ 18
- MongoDB Atlas cluster (or local MongoDB)

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd EESA2
```

### 2. Backend setup
```bash
cd backend
npm install
```

Create a `.env` file from the example:
```bash
cp .env.example .env
```

Fill in your values:
```
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/eesa
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

Start the dev server:
```bash
npm run dev
```

### 3. Frontend setup
```bash
cd frontend
npm install
```

Create a `.env.local` file:
```
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

Start the dev server:
```bash
npm run dev
```

The frontend runs on `http://localhost:3000` and the backend on `http://localhost:5000`.

## API Endpoints

### Auth
| Method | Endpoint              | Access  |
|--------|-----------------------|---------|
| POST   | `/api/auth/register`  | Public  |
| POST   | `/api/auth/login`     | Public  |
| GET    | `/api/auth/me`        | Auth    |
| PUT    | `/api/auth/profile`   | Auth    |

### Events
| Method | Endpoint                    | Access     |
|--------|-----------------------------|------------|
| GET    | `/api/events`               | Public     |
| GET    | `/api/events/:id`           | Public     |
| POST   | `/api/events`               | Leadership |
| PUT    | `/api/events/:id`           | Leadership |
| DELETE | `/api/events/:id`           | Admin      |
| POST   | `/api/events/:id/rsvp`      | Auth       |

### News
| Method | Endpoint                    | Access     |
|--------|-----------------------------|------------|
| GET    | `/api/news`                 | Public     |
| GET    | `/api/news/:id`             | Public     |
| POST   | `/api/news`                 | Leadership |
| PUT    | `/api/news/:id`             | Leadership |
| DELETE | `/api/news/:id`             | Admin      |

### Projects
| Method | Endpoint                    | Access     |
|--------|-----------------------------|------------|
| GET    | `/api/projects`             | Public     |
| GET    | `/api/projects/:id`         | Public     |
| POST   | `/api/projects`             | Leadership |
| PUT    | `/api/projects/:id`         | Leadership |
| DELETE | `/api/projects/:id`         | Admin      |
| POST   | `/api/projects/:id/join`    | Auth       |

### Users
| Method | Endpoint                    | Access     |
|--------|-----------------------------|------------|
| GET    | `/api/users`                | Auth       |
| GET    | `/api/users/leaders`        | Public     |
| GET    | `/api/users/stats`          | Auth       |
| PUT    | `/api/users/:id/role`       | Admin      |
| PUT    | `/api/users/:id/deactivate` | Admin      |

### Contact
| Method | Endpoint                    | Access     |
|--------|-----------------------------|------------|
| POST   | `/api/contact`              | Public     |
| GET    | `/api/contact`              | Admin      |
| PUT    | `/api/contact/:id/read`     | Admin      |
| DELETE | `/api/contact/:id`          | Admin      |

## Deployment

### Backend → Render
1. Push the repo to GitHub.
2. In [Render](https://render.com), create a **New Web Service** from the repo.
3. Set **Root Directory** to `backend`.
4. Render will use `render.yaml` for configuration.
5. Add environment variables: `MONGO_URI`, `JWT_SECRET`, `FRONTEND_URL`, `NODE_ENV=production`.

### Frontend → Vercel
1. Import the repo in [Vercel](https://vercel.com).
2. Set **Root Directory** to `frontend`.
3. Add environment variable: `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api`.
4. Deploy.

## Departments
- Civil Engineering
- Mechanical Engineering
- Electrical Engineering
- Agricultural Engineering
- Chemical Engineering

## License
MIT
