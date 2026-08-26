# eco

## Structure

- `backend/` — Rust (axum) API server
- `frontend/` — React + TypeScript (Vite)

## Development

Backend:

```bash
cd backend
cargo run
```

Runs on `http://localhost:3000`.

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173` and proxies `/api` requests to the backend.
