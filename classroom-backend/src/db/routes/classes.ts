import express from 'express';
import { db } from '../index.js';
import { classes } from '../schema/app.js';
import { create } from 'domain';

const router = express.Router();

router.post('/', async (req, res) => {
	try {
		const { name, teacherId, subjectId, capacity, description, status, bannerUrl, bannerClPubId } = req.body;

		const [createdClass] = await db.insert(classes)
		.values({...req.body, inviteCode: Math.random().toString(36).substring(2, 9), schedules: []})
		.returning({ id: classes.id })

		if (!createdClass) throw Error;

		res.status(201).json({ data: createdClass })
	} catch(e) {
		console.error(e);
		res.status(500).json({error: e})
	}
})

export default router