const express = require("express");
const app = express();
const path = require("path");
const dotenv = require("dotenv");
dotenv.config();
const session = require("express-session");
const passport = require("./config/passport");
const nocache = require("nocache");
const bodyParser = require("body-parser");

const db = require("./config/db");
const userRouter = require("./routes/userRouter");
const adminRouter = require("./routes/adminRouter");

// Initialize the database connection
db();

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 
    }
}));

app.use((req, res, next) => {
    res.set("cache-control", "no-store");
    next();
});

app.use(nocache());
app.use(passport.initialize());
app.use(passport.session());

// Setting up the view engine
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

// Serving static files
app.use(express.static(path.join(__dirname, "public")));

// Routing
app.use("/", userRouter);
app.use("/admin", adminRouter);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null; // Attach user data to res.locals
    next();
});

app.use(bodyParser.urlencoded({ extended: true }));

// ✅ Move the 404 middleware to the end
app.use((req, res) => {
    res.status(404).render('user/page-404', { message: 'Page Not Found' });
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("============");
    console.log(`Server started on port ${PORT}`);
    console.log("============");
});

module.exports = app;
