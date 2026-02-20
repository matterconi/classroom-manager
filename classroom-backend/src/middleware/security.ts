import { Request, Response, NextFunction } from "express";
import { ajByRole } from "../lib/arcjet";

const securityMiddleware = async (req: Request, res: Response, next: NextFunction) => {
	if (process.env.NODE_ENV === 'test') return next();

	try {
		const role: RateLimitRole = (req as any).user?.role ?? 'guest';
		const { client, message } = ajByRole[role];

		const decision = await client.protect(req, { requested: 1 });

		if (decision.isDenied() && decision.reason.isBot()) {
			return res.status(403).json({error: 'Forbidden', message: 'automated requests are not allowed'});
		}

		if (decision.isDenied() && decision.reason.isRateLimit()) {
			return res.status(429).json({error: 'Too Many Requests', message});
		}

		if (decision.isDenied() && decision.reason.isShield()) {
			return res.status(403).json({error: 'Forbidden', message: 'Suspicious activity detected'});
		}

		next();
	} catch (e) {
		console.log(e);
		res.status(500).json({error: 'Internal error', message: 'Something went wrong'})
	}
}

export default securityMiddleware;
