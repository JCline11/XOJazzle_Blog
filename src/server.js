const express = require("express");
const path = require("path");

const app = express();

// configure ejs
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views", "pages"));

// Serve static files
app.use(express.static(path.join(__dirname,  "..", "public")));

// Homepage route
app.get("/", (req, res) => {
    res.render("home");
});

const PORT = 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
