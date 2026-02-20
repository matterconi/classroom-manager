import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db";
import * as schema from '../db/schema/auth';

export const auth = betterAuth({
	secret: process.env.BETTER_AUTH_SECRET!,
	trustedOrigins: [process.env.FRONTEND_URL!, process.env.BETTER_AUTH_URL!],
    database: drizzleAdapter(db, {
        provider: "pg", // or "mysql", "sqlite"
		schema,
    }),
	emailAndPassword: {
		enabled: true,
	},
	user: {
		additionalFields: {
			role: {
				type: "string",
				defaultValue: "student",
				input: false,
			},
			imageCldPubId: {
				type: "string",
				required: false,
				input: false,
			},
		},
	},
});