# Pictoriya Client

Public illustrated library website (Vite + React + TypeScript).

Pair with the API: [pictoria-server](https://github.com/sjAnupa/pictoria-server).

## Local development

1. Copy env and fill Google / Facebook client IDs if you use social login:

```bash
cp .env.example .env
```

2. Install and run (API must be on port 5000):

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

`VITE_API_URL=/api` uses the Vite proxy to `http://localhost:5000`. For production builds, set `VITE_API_URL` to your public API URL (for example `https://api.yourdomain.com/api`) **before** `npm run build`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |

## Deploy

Host the `dist/` folder on any static HTTPS host. Point `VITE_API_URL` at the live API and set the same origin in the API `CLIENT_URL` for CORS.
