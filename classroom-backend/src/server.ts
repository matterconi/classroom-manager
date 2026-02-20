import "apminsight";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import subjectRouter from "./db/routes/subject.js";
import securityMiddleware from "./middleware/security.js";

const app = express();
const PORT = Number(process.env["PORT"] ?? 8000);

app.all('/api/auth/*splat', toNodeHandler(auth))

app.use(express.json());

app.use(
  cors({
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  })
);

app.use(securityMiddleware);

app.use("/api/subjects", subjectRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Classroom Backend API" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
