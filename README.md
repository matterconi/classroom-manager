# Classroom Manager

Full-stack learning workspace for collecting UI components, snippets, theory notes, categories, and collections, with AI-assisted search and content organization.

## Repository

- GitHub: [github.com/matterconi/classroom-manager](https://github.com/matterconi/classroom-manager)

## Features

- Admin-style frontend for components, snippets, theory notes, collections, and categories
- Create, list, and inspect learning resources through Refine pages
- File upload and markdown/code-oriented UI components
- AI routes for search, demos, rendering, clustering, and hierarchy generation
- Relationship and similarity tooling for connecting resources
- Backend API with authentication, security middleware, and database migrations

## Tech Stack

### Frontend

- React 19
- Vite
- TypeScript
- Refine
- React Router
- Tailwind CSS
- Radix UI
- shadcn-style components
- TanStack Table
- React Hook Form
- Recharts
- Sandpack

### Backend

- Node.js
- Express 5
- TypeScript
- Drizzle ORM
- Neon PostgreSQL
- Better Auth
- Arcjet
- OpenAI

## Project Structure

```text
classroom-fullstack/classroom-frontend   React/Refine frontend
classroom-backend                        Express API, auth, database, AI routes
data                                     Local data and pipeline artifacts
```

## Getting Started

Install and run the backend:

```bash
cd classroom-backend
npm install
npm run dev
```

Install and run the frontend:

```bash
cd classroom-fullstack/classroom-frontend
npm install
npm run dev
```

## Backend Scripts

```bash
npm run dev
npm run build
npm run start
npm run db:generate
npm run db:migrate
```

## Frontend Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run format
npm run format:check
```
