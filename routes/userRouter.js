const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userContoller");
const passport = require("passport");
const productController=require("../controllers/user/productController")
const {userAuth, adminAuth}=require("../middlewares/auth")
const profileController=require("../controllers/user/profileController");
const orderController = require("../controllers/user/orderController");
const cartController = require("../controllers/user/cartController");
const wishlistController=require("../controllers/user/wishlistController")
const walletController=require("../controllers/user/walletController")


router.get("/", userController.loadHomePage);
router.get("/pageNotFound", userController.pageNotFound);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp)
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)


//prduct amnangemnet//
router.get("/productDetails",productController.productDetails)

///shopping page//
router.get("/shop",userAuth,userController.loadShoppingPage)

router.get('/filtered',userAuth,userController.getFilteredProducts);
router.get('/shop/category/:category',userAuth, userController.getFilteredProducts);
// Google authentication route
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));

// Google callback route
router.get("/auth/google/callback", passport.authenticate("google", {
    failureRedirect: "/signup", // Redirect to signup page on failure
}),
(req, res) => {
    // Successful authentication, log the user in and redirect to home page
    req.login(req.user, (err) => {
        if (err) {
            return res.redirect("/signup"); // If login fails, redirect to signup
        }

        // After login, set the user session manually if not already set
        req.session.user = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
        };

        // Redirect to home page or dashboard
        res.redirect("/");
    });
});

// profile-management//
router.get("/forgot-password",profileController.getForgotPassPage)
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);

router.get('/blocked', userController.loadBlockedPage);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);
router.get("/userProfile",profileController.userProfile);
router.post("/userprofileName",userAuth,userController.profilename)

router.get("/change-email",userAuth,profileController.changeEmail);
router.post("/change-email",userAuth,profileController.changeEmailValid);
router.post("/verify-email-otp",userAuth,profileController.verifyEmailOtp)
router.post("/update-email",userAuth,profileController.updateEmail)
router.get("/change-password",userAuth,profileController.changePassword);
router.post("/change-password",userAuth,profileController.changePasswordValid);
router.post("/verify-changepassword-otp",userAuth,profileController.verifyChangePassOtp);


//address management//
router.get("/addaddress",userAuth,profileController.addaddress)
router.post("/addaddress",userAuth,profileController.postAddAddress);
router.get("/editAddress",userAuth,profileController.editAddress);
router.post("/editAddress",userAuth,profileController.postEditAddress);
router.get("/deleteAddress",userAuth,profileController.deleteAddress)


// Order Management
router.get("/checkout", orderController.getCheckoutPage);
router.get("/deleteItems", userAuth, orderController.deleteProduct);
router.post("/orderPlaced", userAuth, orderController.orderPlaced);
router.get("/orderDetails",  orderController.getOrderDetailsPage);
router.get('/orderDetails/:orderId', orderController.getOrderDetailsPages);
router.post("/cancelOrder", userAuth, orderController.cancelOrder);
router.get("/myOrders",userAuth,orderController.listMyorders)
router.get("/addNewaddress",userAuth,orderController.addNewaddress)
router.post("/addNewaddress",userAuth,orderController.postAddNewAddress);
router.get("/myOrders",userAuth,orderController.listMyorders)
router.post("/verifyPayment", userAuth, orderController.verify);
router.post("/applyCoupon",userAuth,orderController.applyCoupon);
router.post('/paymentConfirm',userAuth,orderController.paymentConfirm);


// Cart Management
router.get("/cart",userAuth, cartController.getCartPage)
router.post("/addToCart", cartController.addToCart)
router.post("/changeQuantity", userAuth,cartController.changeQuantity)
router.get("/deleteItem", userAuth, cartController.deleteProduct)
router.get("/checkStock",userAuth,cartController.getCheckStock)
router.get('/getCartCount',userAuth,cartController.getCartCount)
router.post("/clearCart",userAuth,cartController.clearCart)


//wishlist management//
router.get("/wishlist",userAuth,wishlistController.loadwishlistPage)
router.post("/addToWishlist",userAuth,wishlistController.addToWishlist)
router.get("/removeWishlist",userAuth,wishlistController.removeProduct)





//return 
router.post("/requestReturn",userAuth,orderController.returnRequest)


//wallet management//
router.get("/wallet", userAuth,walletController.getWalletPage);

//refferal

router.get('/referral',userAuth,userController.getReferralPage);


// Correct export statement
module.exports = router;
