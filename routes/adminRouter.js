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
router.post("/addCategory",adminAuth,categoryController.addCategory);
router.post("/addCategoryOffer",adminAuth,categoryController.addCategoryOffer);
router.post("/removeCategoryOffer", adminAuth,categoryController.removeCategoryOffer);
router.get("/listCategory",adminAuth,categoryController.listCategory);
router.get("/unlistCategory",adminAuth,categoryController.unlistCategory);
router.get("/editCategory/:id",adminAuth,categoryController.getEditCategory);
router.post("/editCategory/:id",adminAuth,categoryController.editCategory);



// Order Management
router.get("/orderList", adminAuth, orderController.getOrderListPageAdmin)
router.get("/orderDetailsAdmin", adminAuth, orderController.getOrderDetailsPageAdmin)
router.get("/changeStatus", adminAuth, orderController.changeOrderStatus);




module.exports=router