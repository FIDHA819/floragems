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
const contactController=require("../controllers/user/contactController")



router.get("/", userAuth,userController.loadHomePage);
router.get("/pageNotFound", userController.pageNotFound);
router.get("/signup", userController.loadSignup);
router.post("/signup", userController.signup);
router.post("/verify-otp", userController.verifyOtp);
router.post("/resend-otp",userController.resendOtp)
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.get("/logout",userController.logout)
// router.get("*", userController.pageNotFound);

//prduct amnangemnet//
router.get("/productDetails",productController.productDetails)

///shopping page//
router.get("/shop",userController.loadShoppingPage)

router.get('/filtered',userAuth,userController.getFilteredProducts);
router.get('/shop/category/:category',userAuth, userController.getFilteredProducts);
router.get('/shop/brands/:brands',userAuth, userController.getFilteredProducts);
// Google authentication route
router.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"], redirectUri: 'https://floragems.shop/auth/google/callback' }));


router.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/signup" }),
    async (req, res) => {
        if (!req.user) {
            return res.redirect("/signup");
        }

        req.session.user = {
            _id: req.user._id,
            name: req.user.name,
            email: req.user.email,
        };

        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.redirect("/signup");
            }
            res.redirect("/");
        });
    }
);


// profile-management//
router.get("/forgot-password",profileController.getForgotPassPage)
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);

router.get('/blocked', userController.loadBlockedPage);
router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);
router.get("/userProfile",userAuth,profileController.userProfile);
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
router.get("/checkout",userAuth, orderController.getCheckoutPage);
router.get("/deleteItems", userAuth, orderController.deleteProduct);
router.post("/orderPlaced", userAuth, orderController.orderPlaced);
router.get("/orderDetails",  userAuth,orderController.getOrderDetailsPage);
router.get('/orderDetails/:orderId', userAuth,orderController.getOrderDetailsPages);
router.get('/get-order-details/:orderId', userAuth,orderController.fetchOrderDetail);
router.post("/cancelOrder", userAuth, orderController.cancelOrder);

router.post("/cancel-item", userAuth, orderController.cancelProductItem);
router.get("/myOrders",userAuth,orderController.listMyorders)
router.get("/addNewaddress",userAuth,orderController.addNewaddress)
router.post("/addNewaddress",userAuth,orderController.postAddNewAddress);
router.get("/myOrders",userAuth,orderController.listMyorders)
router.post("/verifyPayment", userAuth, orderController.verify);
router.post("/applyCoupon",userAuth,orderController.applyCoupon);
router.post('/paymentConfirm',userAuth,orderController.paymentConfirm);



// Cart Management
router.get("/cart",userAuth, cartController.getCartPage)
router.post("/addToCart", userAuth,cartController.addToCart)
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
// router.post("/returnRequest",userAuth,orderController.returnRequest)
router.post("/return-item",userAuth,(req, res) => {
    console.log("single return");
    orderController.singlereturnRequest(req, res);
})
router.post("/checkWalletBalance",userAuth,orderController.checkBalance)



//wallet management//
router.get("/wallet", userAuth,walletController.getWalletPage);

//refferal

router.get('/referral',userAuth,userController.getReferralPage);

// router.post("/continuePayment", userAuth, orderController.continuePendingPayment);

// router.post("/verify-Payment", userAuth, orderController.verifyPayment);
router.post("/createRazorpayOrder", userAuth, (req, res) => {
    console.log("Payment verification request received");
    orderController.createRazorpayOrder(req, res);
});
// router.post("/verify-Payment", userAuth, orderController.verifyPayment);
router.post("/payment", userAuth, (req, res) => {
    console.log("Payment verification request received");
    orderController.verifyPayment(req, res);
});


router.get('/downloadInvoice/:orderId',userAuth,orderController.downloadInvoice);


router.get('/contact',userAuth, contactController.getContactPage);

// Route for handling form submissions
router.post('/contact',userAuth, contactController.handleContactForm);
// Correct export statement
const handleUndefinedRoutes = (req, res) => {
  res.status(404).render('user/page-404', { message: 'Page Not Found' });
};
router.use(handleUndefinedRoutes);
module.exports = router;
