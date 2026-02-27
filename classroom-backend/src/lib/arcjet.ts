import arcjet, { detectBot, shield, tokenBucket, slidingWindow } from "@arcjet/node";

const isDev = process.env["ARCJET_ENV"] === "development";

const aj = arcjet({
  key: process.env["ARCJET_KEY"]!,
  rules: [
    shield({ mode: isDev ? "DRY_RUN" : "LIVE" }),
    detectBot({
      mode: isDev ? "DRY_RUN" : "LIVE",
      allow: ["CATEGORY:SEARCH_ENGINE"],
    }),
    tokenBucket({
      mode: isDev ? "DRY_RUN" : "LIVE",
      refillRate: 20,
      interval: 10,
      capacity: 50,
    }),
  ],
});

const rateLimitConfig = {
  admin: { max: 120, message: "Admin request limit exceeded" },
  teacher: { max: 60, message: "User request limit exceeded" },
  student: { max: 60, message: "User request limit exceeded" },
  guest: { max: 30, message: "Guest request limit exceeded" },
} as const satisfies Record<RateLimitRole, { max: number; message: string }>;

export const ajByRole = Object.fromEntries(
  Object.entries(rateLimitConfig).map(([role, config]) => [
    role,
    {
      client: aj.withRule(slidingWindow({ mode: "LIVE", interval: "1m", max: config.max })),
      message: config.message,
    },
  ])
) as Record<RateLimitRole, { client: ReturnType<typeof aj.withRule>; message: string }>;

export default aj;
