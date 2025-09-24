import express from "express";
import { searchCodebase } from "../utils/searchUtils.js";

const router = express.Router();

// GET /api/search?q=your_query
router.get("/", async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Missing search query" });
    try {
        const results = await searchCodebase(query);
        res.json({ results });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
