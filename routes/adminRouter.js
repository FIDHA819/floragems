const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const adminController = require("../controllers/admin/adminController");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const brandController = require("../controllers/admin/brandController");
const { adminAuth } = require("../middlewares/auth");
const storage=require("../helpers/multer")
const uploads=multer({storage:storage})
const orderController = require("../controllers/admin/orderController");
const couponController=require("../controllers/admin/couponController");
const bannerController=require("../controllers/admin/bannerController")
const statsController=require("../controllers/admin/statsController")

// Admin Routes
router.get("/login", adminController.loadLogin);
router.post("/login", adminController.login);
router.get("/dashboard", adminAuth, adminController.loadDashboard);
router.get("/pageerror", adminController.pageerror);
router.get("/logout", adminController.logout);


// Product management routes
router.get("/addProducts", adminAuth, productController.getProductAddPage);
router.post("/addProducts", adminAuth, uploads.array("images", 4), productController.addProducts);
router.get("/products", adminAuth, productController.getAllProducts);
router.post("/addProductOffer", adminAuth, productController.addProductOffer);
router.post("/removeProductOffer", adminAuth, productController.removeProductOffer);
router.get("/blockProduct", adminAuth, productController.blockProduct);
router.get("/unblockProduct", adminAuth, productController.unblockProduct);
router.get("/editProduct/:id", adminAuth, productController.getEditProduct);
router.post("/editProduct/:id", adminAuth, uploads.array("images", 4), productController.editProduct);

// Image delete functionality
router.post("/deleteImage", adminAuth, productController.deleteSingleImage);

// Brand management
router.get("/brands", adminAuth, brandController.getBrandPage);
router.post("/addBrand",adminAuth, uploads.single("image"), brandController.addBrand);
router.get("/blockBrand", adminAuth, brandController.blockBrand);
router.get("/unBlockBrand", adminAuth, brandController.unBlockBrand);
router.get("/deleteBrand", adminAuth, brandController.deleteBrand);


//customer managemnt//
router.get("/users",adminAuth,customerController.customerInfo)
router.get("/blockCustomer",adminAuth,customerController.customerBlocked)
router.get("/unblockCustomer",adminAuth,customerController.customerunBlocked)

//category management//
router.get("/category",adminAuth,categoryController.categoryInfo);
router.post("/addCategory",adminAuth, uploads.single("image"),categoryController.addCategory);
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer);
router.post("/removeCategoryOffer", adminAuth,categoryController.removeCategoryOffer);
router.get("/listCategory",adminAuth,categoryController.listCategory);
router.get("/unlistCategory",adminAuth,categoryController.unlistCategory);
router.get("/editCategory/:id",adminAuth,categoryController.getEditCategory);
router.post("/editCategory/:id",adminAuth, uploads.single("image"),categoryController.editCategory);



// Order Management
router.get("/orderList", adminAuth, orderController.getOrderListPageAdmin)
router.get("/orderDetailsAdmin", adminAuth, orderController.getOrderDetailsPageAdmin)
// router.get("/changeStatus", adminAuth, orderController.changeOrderStatus);



//coupon controller//
router.get("/coupon",adminAuth,couponController.loadCoupon)
router.post("/createcoupon",adminAuth,couponController.createCoupon)
router.get("/editCoupon",adminAuth,couponController.editCoupon)
router.post("/updateCoupon",adminAuth,couponController.updateCoupon)
router.get("/deleteCoupon",adminAuth,couponController.deleteCoupon)

//return controller

router.get("/changeOrderStatus",adminAuth,orderController.changeOrderStatus)
router.get("/updateItemStatus",adminAuth,orderController.updateItemStatus)
router.post('/rejectReturn',adminAuth,orderController.rejectReturnRequest);



  // Banner routes
router.get("/banner", adminAuth, bannerController.getBannerPage);
router.post("/addBanner", adminAuth, uploads.single("image"), bannerController.addBanner);
router.post("/updateBanner",adminAuth,uploads.single("image"),bannerController.updateBanner);
router.get("/getBannerPage", adminAuth, bannerController.getBanner); // Ensure this route is defined
router.get("/getBanner/:id", adminAuth, bannerController.getBannerById); // Get banner for editing
router.delete("/deleteBanner/:id", adminAuth, bannerController.deleteBanner);

//salesReport
router.get('/salesReport',adminAuth,orderController.getSalesReport);
router.get('/download-sales-report-pdf',adminAuth,orderController.downloadSalesReportPDF);
router.get('/download-sales-report-excel',adminAuth,orderController.downloadSalesReportExcel);

//
router.get('/dashboard-stats', adminAuth,statsController.getDashboardStats);
router.get('/getTopProducts', adminAuth,statsController.getTopProducts);
router.get('/customerFulfillment', adminAuth,statsController.getCustomerFulfillment);
router.get('/earnings', adminAuth,statsController.getEarnings);
router.get('/insights', adminAuth,statsController.getInsights);
router.get('/getSalesReport', adminAuth,statsController.getGraphData)
 


router.get("/dashboard", adminAuth, statsController.customers);


const handleUndefinedRoutes = (req, res) => {
  res.status(404).render('user/page-404', { message: 'Page Not Found' });
};
router.use(handleUndefinedRoutes);

module.exports=router
