const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema")

// Controller to fetch and render the brand page
const getBrandPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 4;
    const skip = (page - 1) * limit;

    const brandData = await Brand.find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalBrands = await Brand.countDocuments();

    const totalPages = Math.ceil(totalBrands / limit);


    const reverseBrand = [...brandData].reverse();

    res.render("admin/brands", {
      data: reverseBrand,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      successMessage: "",
      errorMessage: "",
    });
  } catch (error) {
    console.error("Error fetching brand data:", error);
    res.redirect("/admin/pageerror");
  }
};

const addBrand = async (req, res) => {
  try {
    const brand = req.body.name;

    const findBrand = await Brand.findOne({ brand });
    if (findBrand) {
      console.log("Brand already exists");

      const totalBrands = await Brand.countDocuments();
      const brandData = await Brand.find({});
      const totalPages = Math.ceil(totalBrands / 4);

      return res.render("admin/brands", {
        data: brandData,
        errorMessage: "Brand already exists",
        successMessage: "",
        totalPages,
        currentPage: 1,
        totalBrands,
      });
    }

 
    if (!req.file) {
      console.log("Brand image is missing");

      const totalBrands = await Brand.countDocuments();
      const brandData = await Brand.find({});
      const totalPages = Math.ceil(totalBrands / 4);

      return res.render("admin/brands", {
        data: brandData,
        errorMessage: "Brand image is required",
        successMessage: "",
        totalPages,
        currentPage: 1,
        totalBrands,
      });
    }

    const image = req.file.filename;

  
    const newBrand = new Brand({
      brandName: brand,
      brandImage: image,
    });

    await newBrand.save();
    console.log("Brand saved successfully");


    const totalBrands = await Brand.countDocuments();
    const brandData = await Brand.find({});
    const totalPages = Math.ceil(totalBrands / 4);

    return res.render("admin/brands", {
      data: brandData,
      successMessage: "Brand added successfully",
      errorMessage: "",
      totalPages,
      currentPage: 1,
      totalBrands,
    });
  } catch (error) {
    console.error("Error in addBrand:", error);

    const totalBrands = await Brand.countDocuments();
    const brandData = await Brand.find({});
    const totalPages = Math.ceil(totalBrands / 4);

    return res.render("admin/brands", {
      data: brandData,
      errorMessage: "An error occurred. Please try again.",
      successMessage: "",
      totalPages,
      currentPage: 1,
      totalBrands,
    });
  }
};

// Controller to block a brand
const blockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error blocking brand:", error);
    res.redirect("/admin/pageerror");
  }
};

// Controller to unblock a brand
const unBlockBrand = async (req, res) => {
  try {
    const id = req.query.id;
    await Brand.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error unblocking brand:", error);
    res.redirect("/admin/pageerror");
  }
};

// Controller to delete a brand
const deleteBrand = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id) {
      return res.status(400).redirect("/pageerror");
    }

    await Brand.deleteOne({ _id: id });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).redirect("/admin/pageerror");
  }
};

module.exports = {
  getBrandPage,
  addBrand,
  blockBrand,
  unBlockBrand,
  deleteBrand,
};
