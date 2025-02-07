const Category = require("../../models/categorySchema");
const Products = require("../../models/productSchema");

const categoryInfo = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const categoryData = await Category.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalCategories = await Category.countDocuments();
    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/category", {
      cat: categoryData,
      currentPage: page,
      totalPages: totalPages,
      totalCategories: totalCategories,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/pageerror");
  }
};

const addCategory = async (req, res) => {
  const { name, description } = req.body;
  try {

    const existingCategory = await Category.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ error: "Category already exists" });
    }


    if (!req.file) {
      return res.status(400).json({ error: "Category image is required" });
    }

    const image = req.file.filename;


    const newCategory = new Category({
      name,
      description,
      categoryImage: image,
    });

    await newCategory.save();
    console.log("Category saved:", newCategory);
    return res.json({ status: true, message: "Category added successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const addCategoryOffer = async (req, res) => {
  try {
    const { percentage, categoryId, offerType, validUntil } = req.body;

    if (!percentage || isNaN(percentage) || percentage <= 0 || percentage > 100) {
      return res.status(400).json({ status: false, message: "Invalid percentage value" });
    }
    if (!categoryId) {
      return res.status(400).json({ status: false, message: "Category ID is required" });
    }
    if (!offerType || !["percentage", "flat"].includes(offerType)) {
      return res.status(400).json({ status: false, message: "Invalid offer type" });
    }
    if (validUntil && isNaN(new Date(validUntil).getTime())) {
      return res.status(400).json({ status: false, message: "Invalid validUntil date" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const products = await Products.find({ category: category._id });

    const hasProductOffer = products.some((product) => product.productOffer > percentage);
    if (hasProductOffer) {
      return res.json({
        status: false,
        message: "Products in this category already have a higher offer",
      });
    }

    category.categoryOffer = percentage;
    category.offerType = offerType;
    category.validUntil = validUntil ? new Date(validUntil) : null;
    await category.save();

    for (const product of products) {
      product.productOffer = 0;
      product.salePrice =
        offerType === "percentage"
          ? product.regularPrice - Math.floor((product.regularPrice * percentage) / 100)
          : product.regularPrice - percentage;
      await product.save();
    }

    res.json({ status: true, message: "Offer added successfully" });
  } catch (error) {
    console.error("Error adding offer:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};
const removeCategoryOffer = async (req, res) => {
  try {
    const { categoryId } = req.body;

    if (!categoryId) {
      return res.status(400).json({ status: false, message: "Category ID is required" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const products = await Products.find({ category: category._id });

    for (const product of products) {
      product.salePrice = product.regularPrice;
      product.productOffer = 0;
      await product.save();
    }

    category.categoryOffer = 0;
    category.offerType = null;
    category.validUntil = null;
    await category.save();

    res.json({ status: true, message: "Offer removed successfully" });
  } catch (error) {
    console.error("Error removing offer:", error);
    res.status(500).json({ status: false, message: "Internal server error" });
  }
};

const listCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: true } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error listing category:", error);
    res.redirect("/pageerror");
  }
};

const unlistCategory = async (req, res) => {
  try {
    const id = req.query.id;
    await Category.updateOne({ _id: id }, { $set: { isListed: false } });
    res.redirect("/admin/category");
  } catch (error) {
    console.error("Error unlisting category:", error);
    res.redirect("/pageerror");
  }
};

const getEditCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).redirect("/admin/pageerror");
    }
    res.render("admin/edit-category", { category });
  } catch (error) {
    res.redirect("/admin/pageerror");
  }
};

const editCategory = async (req, res) => {

  try {
    const id = req.params.id;
    const { categoryName, description } = req.body;
    let updatedCategoryData = { name: categoryName, description };

    if (req.file) {
      updatedCategoryData.categoryImage = req.file.filename;
    }


    const existingCategory = await Category.findOne({ name: categoryName, _id: { $ne: id } });
    if (existingCategory) {
      return res.status(400).json({ error: "Category exists, please choose another name" });
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updatedCategoryData, { new: true });
    if (!updatedCategory) {
      return res.status(404).json({ error: "Category not found" });
    }

    res.json({ status: true });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ error: "Internal server error" });
  }

};
module.exports = {
  categoryInfo,
  addCategory,
  addCategoryOffer,
  removeCategoryOffer,
  listCategory,
  unlistCategory,
  getEditCategory,
  editCategory,
};
