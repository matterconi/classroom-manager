import express from 'express';
import { db } from '../index.js';
import { classes, subjects } from '../schema/app.js';
import { ilike, eq, and, sql, getTableColumns, desc, or } from "drizzle-orm";
import { user } from '../schema/auth.js';

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
// Allow only letters, numbers, spaces and basic punctuation — strips LIKE wildcards (%, _)
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const STATUS_VALUES = ["active", "inactive", "archived"] as const;

const router = express.Router();

router.get('/', async (req, res) => {
	try {
		const { search, status, page = 1, limit = 10 } = req.query;

		const currentPage = Math.max(1, parseInt(page as string, 10));
		const limitPerPage = Math.min(LIMIT_MAX, parseInt(limit as string, 10));

		const offset = (currentPage - 1) * limitPerPage;

		const filterConditions = [];

		if (search) {
			if(typeof search !== 'string' || search.length > SEARCH_MAX_LENGTH) {
				res.status(400).json({error: "Invalid search"});
				return;
			}
			const trimmedSearch = search.trim();
			if (trimmedSearch && !SEARCH_PATTERN.test(trimmedSearch)) {
				res.status(400).json({error: "Invalid characters"});
				return;
			}
			filterConditions.push(
				or(
					ilike(classes.name, `%${trimmedSearch}%`),
				)
			)
		};

		if (status) {
			if(!STATUS_VALUES.includes(status as any) ) {
				res.status(400).json({error: "Invalid status"});
				return;
			}
			filterConditions.push(
				eq(classes.status, status as (typeof STATUS_VALUES)[number]),
			)
		};

		const where =
			  filterConditions.length > 0 ? and(...filterConditions) : undefined

		const countResult = await db
			.select( {count: sql<number>`count(*)`})
			.from(classes)
			.leftJoin(subjects, eq(classes.subjectId, subjects.id))
			.leftJoin(user, eq(classes.teacherId, user.id))
			.where(where)

		const totalCount = Number(countResult[0]?.count ?? 0);

		const classesList = await db
			.select({
				...getTableColumns(classes),
				subject: { ...getTableColumns(subjects) },
				teacher: {name: user.name, email: user.email}
			})
			.from(classes)
			.leftJoin(subjects, eq(classes.subjectId, subjects.id))
			.leftJoin(user, eq(classes.teacherId, user.id))
			.where(where)
			.orderBy(desc(classes.createdAt))
			.limit(limitPerPage)
			.offset(offset)

		res.status(200).json({
			data: classesList,
			pagination: {
				page: currentPage,
				limit: limitPerPage,
				totalCount: totalCount,
				totalPages: Math.ceil(totalCount / limitPerPage)
			}
		})


	} catch(e) {
		console.error(e);
		res.status(500).json({ error: 'error'})
	}
})

router.post('/', async (req: express.Request, res: express.Response) => {
	try {
		const { name, teacherId, subjectId, capacity, description, status, bannerUrl, bannerCldPubId } = req.body;

		// Validazione campi obbligatori
		if (!name || typeof name !== 'string') {
			res.status(400).json({ error: "Name is required" });
			return;
		}
		if (!teacherId || typeof teacherId !== 'string') {
			res.status(400).json({ error: "Teacher is required" });
			return;
		}
		if (!subjectId || typeof subjectId !== 'number') {
			res.status(400).json({ error: "Subject is required" });
			return;
		}
		if (!capacity || typeof capacity !== 'number' || capacity < 1) {
			res.status(400).json({ error: "Valid capacity is required" });
			return;
		}
		if (!description || typeof description !== 'string') {
			res.status(400).json({ error: "Description is required" });
			return;
		}
		if (status && !STATUS_VALUES.includes(status as (typeof STATUS_VALUES)[number])) {
			res.status(400).json({ error: "Invalid status" });
			return;
		}

		const [createdClass] = await db.insert(classes)
			.values({
				name,
				teacherId,
				subjectId,
				capacity,
				description,
				status,
				bannerUrl,
				bannerCldPubId,
				inviteCode: Math.random().toString(36).substring(2, 9),
				schedules: [],
			})
			.returning({ id: classes.id })

		if (!createdClass) {
			res.status(500).json({ error: "Failed to create class" });
			return;
		}

		res.status(201).json({ data: createdClass })
	} catch(e) {
		console.error(e);
		res.status(500).json({ error: "Internal server error" })
	}
})

export default router