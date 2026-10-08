const express = require("express");

const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);

const env = require("./config");

const app = express();

const helmet = require("helmet");

app.use(helmet());

app.use(
    session({
        store: new pgSession({
            conString: env.DATABASE_URL
        }),
        secret: env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 1000 * 60 * 60 * 24
        }
    })
);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static("public"));

app.set("view engine", "ejs");
app.set("views", "./src/views");

module.exports = app;