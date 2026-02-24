import "apminsight";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import categoryRouter from "./db/routes/categories.js";
import componentRouter from "./db/routes/components.js";
import collectionRouter from "./db/routes/collections.js";
import userRouter from "./db/routes/users.js";
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

app.use("/api/categories", categoryRouter);
app.use("/api/components", componentRouter);
app.use("/api/collections", collectionRouter);
app.use("/api/users", userRouter);

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Component Library API" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
