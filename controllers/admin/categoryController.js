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
    const newCategory = new Category({
      name,
      description,
    });
    await newCategory.save();
    return res.json({ message: "Category added successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const addCategoryOffer = async (req, res) => {
  try {
    const percentage = parseInt(req.body.percentage);
    const categoryId = req.body.categoryId;

    if (!percentage || isNaN(percentage) || percentage <= 0 || percentage > 100) {
      return res.status(400).json({ status: false, message: "Invalid percentage value" });
    }
    if (!categoryId) {
      return res.status(400).json({ status: false, message: "Category ID is required" });
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const products = await Products.find({ category: category._id });

    const hasProductOffer = products.some(
      (product) => product.productOffer > percentage
    );
    if (hasProductOffer) {
      return res.json({
        status: false,
        message: "Products in this category already have a higher offer",
      });
    }

    category.categoryOffer = percentage;
    await category.save();

    for (const product of products) {
      product.productOffer = 0;
      product.salePrice = product.regularPrice - Math.floor((product.regularPrice * percentage) / 100);
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
    const categoryId = req.body.categoryId;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const percentage = category.categoryOffer;
    const products = await Products.find({ category: category._id });

    for (const product of products) {
      product.salePrice = product.regularPrice;
      product.productOffer = 0;
      await product.save();
    }

    category.categoryOffer = 0;
    await category.save();

    res.json({ status: true });
  } catch (error) {
    console.error(error);
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
        const id = req.params.id;  // Extract the category ID
        console.log("Editing category with ID:", id);  // Log the category ID for debugging
        const category = await Category.findById(id);

        if (!category) {
            console.log("Category not found");  // Log if the category is not found
            return res.status(404).redirect("/admin/pageerror");
        }

        res.render("admin/edit-category", { category: category });
    } catch (error) {
        console.error("Error fetching category:", error);
        res.redirect("/admin/pageerror");
    }
};


const editCategory = async (req, res) => {
  try {
    const id = req.params.id;
    const { categoryName, description } = req.body;

    const existingCategory = await Category.findOne({ name: categoryName, _id: { $ne: id } });
    if (existingCategory) {
      return res.status(400).json({ error: "Category exists, please choose another name" });
    }

    // Update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name: categoryName, description: description },
      { new: true }
    );

    if (updatedCategory) {
      res.redirect("/admin/category");
    } else {
      res.status(404).json({ error: "Category not found" });
    }
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
