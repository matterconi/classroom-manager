# AI Recursive Pipeline + Refine Dashboard

Self-recursive AI pipeline for analyzing and categorizing an application's codebase, paired with a Refine dashboard for browsing the generated hierarchy, relationships, demos, and searchable knowledge structure.

## Repository

- GitHub: [github.com/matterconi/classroom-manager](https://github.com/matterconi/classroom-manager)

## Overview

This project evolved from a classroom-style resource manager into a code intelligence tool. The backend walks through application code, builds structured item records, clusters related files and concepts, scores coherence, generates hierarchy layers, and exposes the result through API routes. The frontend is a Refine-based dashboard for inspecting, searching, and refining that recursive map.

The goal is to turn an app's source code into an explorable system: components, snippets, concepts, demos, relationships, and categories become connected artifacts instead of loose files.

## Features

- Recursive codebase categorization pipeline
- AI-assisted hierarchy generation for application structure
- Relationship mapping between code items, demos, snippets, and concepts
- Search routes for exploring generated knowledge
- Coherence, scoring, clustering, and rendering pipeline modules
- Refine dashboard for browsing components, snippets, theory notes, categories, and collections
- File upload and markdown/code-oriented UI components
- Backend API with authentication, security middleware, and database migrations

## Tech Stack

### Dashboard

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

### Pipeline API

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
classroom-fullstack/classroom-frontend   Refine dashboard for exploring pipeline output
classroom-backend                        Express API, auth, database, AI routes, recursive pipeline
data                                     Local generated data and pipeline artifacts
pipeline.txt                            Pipeline notes and current processing context
```

## Getting Started

Install and run the backend:

```bash
cd classroom-backend
npm install
npm run dev
```

Install and run the dashboard:

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

## Dashboard Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run format
npm run format:check
```
