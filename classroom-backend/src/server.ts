import "apminsight";
import express, { type Request, type Response } from "express";
import cors from "cors";
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth.js";
import categoryRouter from "./db/routes/categories.js";
import itemRouter from "./db/routes/items.js";
import userRouter from "./db/routes/users.js";
import aiRouter from './db/routes/ai.js'
import searchRouter from './db/routes/search.js'
import demoRouter from './db/routes/demos.js'
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
app.use("/api/items", itemRouter);
app.use("/api/users", userRouter);
app.use("/api/ai", aiRouter)
app.use("/api/search", searchRouter)
app.use("/api/demos", demoRouter)

app.get("/", (_req: Request, res: Response) => {
  res.json({ message: "La Bottega UI — API" });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
