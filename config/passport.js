const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userschema");
const env = require("dotenv").config();

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/callback"
},
async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists in the database
        let user = await User.findOne({ googleId: profile.id });
        if (user) {
            // User found, return user
            return done(null, user);
        } else {
            // User doesn't exist, create a new user
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            await user.save();
            return done(null, user);
        }
    } catch (error) {
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user.id);  // Serialize user ID to store in session
});

passport.deserializeUser((id, done) => {
    // Deserialize user from session using the stored user ID
    User.findById(id)
        .then((user) => {
            done(null, user);  // User object will be attached to `req.user`
        })
        .catch((err) => {
            done(err, null);
        });
});

module.exports = passport;
