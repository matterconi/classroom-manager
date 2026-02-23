import { ilike, or, and, sql, desc } from "drizzle-orm";
import express from "express";
import { db } from "../index.js";
import { departments } from "../schema/index.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const router = express.Router();

router.get("/", async (req: express.Request, res: express.Response) => {

  try {
    const { search, page = 1, limit = 10 } = req.query;

  const currentPage = Math.max(1, parseInt(page as string, 10));
  const limitPerPage = Math.min(LIMIT_MAX, Math.max(1, parseInt(limit as string, 10)));
  const offset = (currentPage - 1) * limitPerPage;

  const filterConditions = [];

      if (search) {
        if (typeof search !== "string" || search.length > SEARCH_MAX_LENGTH) {
          res.status(400).json({ error: "Invalid search parameter" });
          return;
        }
        const trimmedSearch = search.trim();
        if (trimmedSearch && !SEARCH_PATTERN.test(trimmedSearch)) {
          res.status(400).json({ error: "Search contains invalid characters" });
          return;
        }
        filterConditions.push(
          or(
            ilike(departments.name, `%${trimmedSearch}%`),
            ilike(departments.code, `%${trimmedSearch}%`)
          )
        );
      }

      const where = filterConditions.length > 0 ? and(...filterConditions) : undefined;

      const countResult = await db.select({ count: sql<number>`count(*)`})
        .from(departments)
        .where(where)

      const totalCount = Number(countResult[0]?.count ?? 0);

      const departmentList = await db.select()
        .from(departments)
        .where(where)
        .orderBy(desc(departments.createdAt))
        .limit(limitPerPage)
        .offset(offset)
      
      res.status(200).json({
        data: departmentList,
        pagination: {
          page: currentPage,
          limit: limitPerPage,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limitPerPage)
        }
      })
  } catch (e) {
    console.error(e);
    res.status(500).json({message: "Something went wrong"});
  }
});

export default router;
