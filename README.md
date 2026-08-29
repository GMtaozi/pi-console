# Pi Console

Pi Console is the management interface for the Pi Agent platform MVP.

## Features

- **Dashboard**: Overview of sessions, workflows, and extensions
- **Sessions**: Chat session management with real-time messaging
- **Workflows**: Visual workflow designer powered by React Flow
- **Agent Config**: LLM model settings, temperature, max tokens, system prompt
- **Extensions**: Plugin management for the agent platform
- **Settings**: Platform configuration and information

## Tech Stack

### Frontend
- React 18
- Vite
- TypeScript
- React Router DOM
- @xyflow/react (React Flow v12)
- Lucide React (icons)

### Backend
- Node.js
- Fastify
- SQLite (sqlite3 + sqlite wrapper)
- bcryptjs (password hashing)
- jsonwebtoken (JWT auth)

## Project Structure

```
pi-console/
├── frontend/          # React SPA
│   ├── src/
│   │   ├── pages/     # Dashboard, Sessions, Workflows, AgentConfig, Extensions, Settings
│   │   ├── components/# Sidebar, Layout
│   │   └── services/  # API client
│   └── ...
├── backend/           # Fastify API server
│   ├── src/
│   │   ├── routes/    # Auth, Sessions, Workflows, AgentConfig, Extensions
│   │   ├── middleware/# JWT authentication
│   │   └── db.ts      # SQLite connection
│   ├── migrations/    # schema.sql
│   └── ...
├── docker-compose.yml # Docker orchestration
└── README.md
```

## Getting Started

### Prerequisites
- Node.js >= 18
- npm or yarn

### Development

1. Start the backend:
```bash
cd backend
npm install
npm run dev
```

2. Start the frontend:
```bash
cd frontend
npm install
npm run dev
```

The frontend will proxy API requests to `http://localhost:3001`.

### Docker

Run both services together:
```bash
docker-compose up --build
```

### Default Account
- Email: `demo@pi.console`
- Password: `demo123`

## API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Sessions
- `GET /api/sessions` (supports pagination, search, sort)
- `GET /api/sessions/:id`
- `POST /api/sessions`
- `POST /api/sessions/:id/messages`
- `DELETE /api/sessions/:id`

### Workflows
- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`
- `DELETE /api/workflows/:id`
- `POST /api/workflows/:id/execute`
- `GET /api/workflows/:id/executions`
- `GET /api/workflows/:id/executions/:eid`
- `POST /api/workflows/:id/executions/:eid/cancel`

### Agent Config
- `GET /api/agent-config`
- `PUT /api/agent-config`

### Extensions
- `GET /api/extensions`
- `POST /api/extensions`
- `DELETE /api/extensions/:id`

## License

MIT
