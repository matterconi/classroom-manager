import { ilike, or, eq, and, sql, getTableColumns, desc } from "drizzle-orm";
import express from "express";
import { db } from "../index.js";
import { departments, subjects } from "../schema/index.js";

const LIMIT_MAX = 100;
const SEARCH_MAX_LENGTH = 100;
// Allow only letters, numbers, spaces and basic punctuation — strips LIKE wildcards (%, _)
const SEARCH_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;
const DEPT_PATTERN = /^[\p{L}\p{N}\s\-.,]+$/u;

const router = express.Router();

router.get("/", async (req: express.Request, res: express.Response) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const currentPage = Math.max(1, parseInt(page as string, 10));
    const limitPerPage = Math.min(
      LIMIT_MAX,
      Math.max(1, parseInt(limit as string, 10))
    );

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
          ilike(subjects.name, `%${trimmedSearch}%`),
          ilike(subjects.code, `%${trimmedSearch}%`)
        )
      );
    }

    if (department) {
      if (
        typeof department !== "string" ||
        department.length > SEARCH_MAX_LENGTH
      ) {
        res.status(400).json({ error: "Invalid department parameter" });
        return;
      }
      const trimmedDept = department.trim();
      if (trimmedDept && !DEPT_PATTERN.test(trimmedDept)) {
        res
          .status(400)
          .json({ error: "Department contains invalid characters" });
        return;
      }
      filterConditions.push(ilike(departments.name, `%${trimmedDept}%`));
    }

    const where =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(where);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const subjectList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(where)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: subjectList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
