const express = require("express");
const router = express.Router();
const userController = require("../controllers/user/userContoller");
const passport = require("passport");
const productController=require("../controllers/user/productController")
const {userAuth}=require("../middlewares/auth")
const profileController=require("../controllers/user/profileController");
const orderController = require("../controllers/user/orderController");
const cartController = require("../controllers/user/cartController");

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
router.get("/filter",userAuth,userController.filterProduct)
router.get("/filterPrice",userAuth,userController.filterByPrice)

router.get("/filterMetal", userAuth, userController.filterByMetal);
router.post("/search",userAuth,userController.searchProducts);

router.get("/shopSort", userAuth, userController.sortPage);

//google authentication //
router.get("/auth/google",passport.authenticate("google",{scope:["profile","email"]}))
router.get("/auth/google/callback",passport.authenticate("google",{failureRedirect:"/signup"}),
(req,res)=>{
    res.redirect("/")
})

// profile-management//
router.get("/forgot-password",profileController.getForgotPassPage)
router.post("/forgot-email-valid", profileController.forgotEmailValid);
router.post("/verify-passForgot-otp", profileController.verifyForgotPassOtp);


router.get("/reset-password",profileController.getResetPassPage);
router.post("/resend-forgot-otp",profileController.resendOtp);
router.post("/reset-password",profileController.postNewPassword);
router.get("/userProfile", userAuth,profileController.userProfile);

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
router.get("/checkout", userAuth, orderController.getCheckoutPage);
router.get("/deleteItems", userAuth, orderController.deleteProduct);
router.post("/orderPlaced", userAuth, orderController.orderPlaced);
router.get("/orderDetails", userAuth, orderController.getOrderDetailsPage);
router.post("/cancelOrder", userAuth, orderController.cancelOrder);
router.post("/returnrequestOrder", userAuth, orderController.returnorder);
// router.post("/verifyPayment", userAuth, orderController.verify);
// router.post("/singleProductId", userAuth, orderController.changeSingleProductStatus);
router.post('/paymentConfirm', userAuth, orderController.paymentConfirm);
router.get("/downloadInvoice/:orderId", userAuth, orderController.downloadInvoice);
router.get("/addNewaddress",userAuth,orderController.addNewaddress)
router.post("/addNewaddress",userAuth,orderController.postAddNewAddress);


// Cart Management
router.get("/cart", userAuth, cartController.getCartPage)
router.post("/addToCart",userAuth, cartController.addToCart)
router.post("/changeQuantity", userAuth,cartController.changeQuantity)
router.get("/deleteItem", userAuth, cartController.deleteProduct)
router.get("/checkStock",userAuth,cartController.getCheckStock)
router.get('/getCartCount',userAuth,cartController.getCartCount)

// Correct export statement
module.exports = router;
