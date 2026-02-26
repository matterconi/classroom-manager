import express from "express";
import { generate } from "../../lib/deepseek.js"

const router = express.Router();

// TODO: Creare POST "/" — endpoint principale per generazione AI
// TODO: Validare il body (prompt, campo target, contesto)
// TODO: Chiamare la funzione generate() da lib/deepseek
// TODO: Restituire la risposta AI al client

router.post("/", async (req, res) => {
	const { prompt } = req.body;
	if (!prompt || typeof prompt !== "string")	{
		return res.status(400).json({error: "prompt is required"});
	}
	try {
		const result = await generate(prompt);
		res.json({data: result});
	} catch (e) {
		console.error(e);
		return res.status(500).json({message: "AI generation failed"});
	}
})

export default router;
