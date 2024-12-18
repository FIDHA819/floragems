const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userContoller");
const passport = require("passport");

router.get("/", userController.loadHomePage);
router.get("/pageNotFound", userController.pageNotFound);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp)
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)


//google authentication //
router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}))
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signup"}),
(req,res)=>{
    res.redirect("/")
})
// Correct export statement
module.exports = router;
