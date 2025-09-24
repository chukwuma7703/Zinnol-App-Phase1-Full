import express from "express";
const app = express();
app.get("/", (req, res) => {
    res.send("Test server working");
});
app.listen(4001, '0.0.0.0', () => {
    console.log("Test server listening on 4001");
});
