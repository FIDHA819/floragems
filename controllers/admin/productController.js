const Product = require("../../models/productSchema");
const mongoose = require('mongoose');
const Category = require("../../models/categorySchema");
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const Brand=require("../../models/brandSchema")
const User=require("../../models/userschema")



const getProductAddPage = async (req, res) => {
    try {
        const categories = await Category.find({ isListed: true });
        const brand=await Brand.find({isBlocked:false})
        res.render("admin/product-add", { cat: categories,brand:brand });
    } catch (error) {
        console.error("Error loading product add page:", error.message);
        res.redirect("/admin/pageerror");
    }
};

const addProducts = async (req, res) => {
    try {
        console.log(req.files);
        const products = req.body;
        const productExists = await Product.findOne({ productName: products.productName });
  
        // Ensure description is a string
        const description = Array.isArray(products.description) ? products.description.join('\n') : products.description;
       
        if (!productExists) {
            const images = [];
            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join("public", "uploads", "product-images", req.files[i].filename);

                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440 })
                        .toFile(resizedImagePath);

                    images.push(req.files[i].filename);
                }
            }

            if (images.length === 0) {
                return res.status(400).json({ message: "At least one image is required." });
            }

            const categoryId = await Category.findOne({ name: products.category });
            if (!categoryId) {
                return res.status(400).json({ message: "Invalid category name." });
            }
            console.log(products.stockCode);
            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: products.brand,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                quantity: products.quantity,
                
                metalType: products.metalType,
                productImages: images,
                status: "Available",
                createdOn: new Date(),
            });

            await newProduct.save();
            res.redirect("/admin/addProducts");
        } else {
            res.status(400).json({ message: "Product already exists, please try with another name." });
        }
    } catch (error) {
        console.error("Error adding product:", error);
        res.redirect("/admin/pageerror");
    }
};



const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 4;

        const productQuery = {
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
            ],
        };

        if (search) {
            const category = await Category.findOne({ name: { $regex: new RegExp(".*" + search + ".*", "i") } });
            if (category) {
                productQuery.$or.push({ category: category._id });
            }
        }

        const productData = await Product.find(productQuery)
            .limit(limit)
            .skip((page - 1) * limit)
            .populate("category")
            .exec();

        const count = await Product.countDocuments(productQuery);
        const categories = await Category.find({ isListed: true });

        res.render("admin/products", {
            data: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit),
            cat: categories,
        });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.redirect("/admin/pageerror");
    }
};
const addProductOffer = async (req, res) => {
    try {
        const { percentage, productId, offerType, validUntil } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        const category = await Category.findById(product.category);
        if (!category || (category.categoryOffer && category.categoryOffer > percentage)) {
            return res.json({ status: false, message: "This product already has a better category offer" });
        }

        product.salePrice = product.regularPrice - Math.floor(product.regularPrice * (percentage / 100));
        product.productOffer = percentage;
        product.offerType = offerType;
        product.validUntil = validUntil;

        await product.save();
        res.json({ status: true });
    } catch (error) {
        console.error("Error adding product offer:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const removeProductOffer = async (req, res) => {
    try {
        const { productId } = req.body;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found for offer removal" });
        }

        product.salePrice = product.regularPrice;
        product.productOffer = 0;
        product.offerType = null;
        product.validUntil = null;

        await product.save();
        res.json({ status: true });
    } catch (error) {
        console.error("Error removing product offer:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

const blockProduct = async (req, res) => {
    try {
        const { id } = req.query;

        // Validate the ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ status: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        product.isBlocked = true;
        await product.save();
        res.json({ status: true, message: "Product blocked successfully" });
    } catch (error) {
        console.error("Error blocking product:", error);
        res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};

const unblockProduct = async (req, res) => {
    try {
        const { id } = req.query;

        // Validate the ID format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ status: false, message: "Invalid product ID" });
        }

        const product = await Product.findById(id);
        if (!product) {
            return res.status(400).json({ status: false, message: "Product not found" });
        }

        product.isBlocked = false;
        await product.save();
        res.json({ status: true, message: "Product unblocked successfully" });
    } catch (error) {
        console.error("Error unblocking product:", error);
        res.status(500).json({ status: false, message: "Internal server error", error: error.message });
    }
};


const getEditProduct = async (req, res) => {
    try {
        const productId = req.params.id;
const brand=await Brand.find({})
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).render("user/page-404", { message: "Product not found" });
        }

        const categories = await Category.find({ isListed: true });
        res.render("admin/edit-product", { category: categories, product:product ,brand:brand });
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).render("admin/pageerror", { message: "Server error. Please try again later." });
    }
};
const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({ _id: id });
        const data = req.body;

        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id },
        });
        if (existingProduct) {
            return res.status(400).json({ error: "Product with this name already exists. Please try with another name." });
        }

        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
        }

        const updateFields = {
            productName: data.productName,
            description: data.description,
            brand: data.brand,
            category: product.category,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            quantity: data.quantity,
            metalType: data.metalType,
        };
        if (req.files.length > 0) {
            updateFields.$push = { productImages: { $each: images } };
        }

        await Product.findByIdAndUpdate(id, updateFields, { new: true });
        res.redirect("/admin/products");
    } catch (error) {
        console.error(error);
        res.redirect("/admin/pageerror");
    }
};

const deleteSingleImage = async (req, res) => {
    try {
        const { imageNameToServer, productIdToServer } = req.body;

        const product = await Product.findByIdAndUpdate(productIdToServer);
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }

        product.productImages = product.productImages.filter(image => image !== imageNameToServer);
        await product.save();

        const imagePath = path.join("public", "uploads", "re-image", imageNameToServer);
        if (fs.existsSync(imagePath)) {
         await   fs.unlinkSync(imagePath);
         console.log(`Image ${imageNameToServer} deleted succesfully`)
        }else{
            console.log(`${imageNameToServer} not found`)
        }

        res.json({ status: true, message: "Image deleted successfully" });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).json({ status: false, message: "Internal server error" });
    }
};

module.exports = {
    getProductAddPage,
    addProducts,
    getAllProducts,
    addProductOffer,
    removeProductOffer,
    blockProduct,
    unblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage,
};
