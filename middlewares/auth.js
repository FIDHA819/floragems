const User=require("../models/userschema");
const userAuth = async (req, res, next) => {
    if (req.session.user) {
        try {
            // Fetch user by session user ID
            const user = await User.findById(req.session.user._id);

            // If user exists and is not blocked
            if (user && !user.isBlocked) {
                req.user = user; // Attach the user object to the request
                return next(); // Proceed to the next middleware or route handler
            } else {
                // If user is blocked, destroy the session and redirect to login
                req.session.destroy((err) => {
                    if (err) {
                        console.error("Error destroying session:", err);
                    }
                    return res.redirect("/login"); // Redirect to login if blocked
                });
            }
        } catch (error) {
            console.error("Error in user auth middleware:", error);
            return res.status(500).send("Internal server error");
        }
    } else {
        console.log("Guest user accessing shop.");
        req.user = null; // Allow guest users to proceed without authentication
        return next();
    }
};


const adminAuth=(req,res,next)=>{
    User.findOne({isAdmin:true})
        .then(data=>{
            if(data ){
                next()
            }else{
                res.redirect("/admin/login")
            }
        })
        .catch(error=>{
            console.log("error in user adminauth middleware");
            res.status(500).send("internal server error")
            
        })
    }
    

module.exports={
    userAuth,
    adminAuth,

}