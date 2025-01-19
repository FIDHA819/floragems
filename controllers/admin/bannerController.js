const Banner = require("../../models/bannerSchema");
// bannerController.js
const getBannerPage = async (req, res) => {
    try {
      const banners = await Banner.find();
      return res.render("admin/banner", { banners: banners || [] });  // Ensure empty array if no banners
    } catch (error) {
      return res.status(500).json({ message: "Error fetching banners", banners: [] });
    }
  };
  
  // bannerController.js
const addBanner = async (req, res) => {
    try {
      const imageUrl = req.file ? `/uploads/re-image/${req.file.filename}` : null;
      const { title, subtitle, link } = req.body;
  
      const newBanner = new Banner({
        title,
        subtitle,
        link,
        imageUrl,
        isActive: true,  // Default status
      });
  
      await newBanner.save();
      res.status(200).json({ status: true, message: "Banner added successfully!" });
    } catch (error) {
      res.status(500).json({ status: false, message: "Error adding banner", error });
    }
  };
  
  const updateBanner = async (req, res) => {
    const { bannerId, title, subtitle, link, isActive } = req.body;
    const imageUrl = req.file ? req.file.path : null; // Get image URL if uploaded
  
    try {
      const banner = await Banner.findById(bannerId);
  
      if (!banner) {
        return res.status(404).json({ status: false, message: 'Banner not found' });
      }
  
      banner.title = title || banner.title;
      banner.subtitle = subtitle || banner.subtitle;
      banner.link = link || banner.link;
      banner.isActive = isActive !== undefined ? isActive : banner.isActive;
  
      if (imageUrl) {
        banner.imageUrl = imageUrl; // Update the image URL if new image is uploaded
      }
  
      await banner.save();
      res.json({ status: true, message: 'Banner updated successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ status: false, message: 'Error updating banner', error: error.message });
    }
  };
  
  
// bannerController.js
const getBanner = async (req, res) => {
    try {
      const banners = await Banner.find();
      res.json({ banners });
    } catch (error) {
      res.status(500).json({ message: "Error fetching banners" });
    }
  };
// bannerController.js
const getBannerById = async (req, res) => {
    try {
      const bannerId = req.params.id;
      const banner = await Banner.findById(bannerId);
      if (!banner) {
        return res.status(404).json({ status: false, message: "Banner not found" });
      }
      res.json({ banner });
    } catch (error) {
      res.status(500).json({ message: "Error fetching banner" });
    }
  };
      
// bannerController.js
const deleteBanner = async (req, res) => {
    try {
      const bannerId = req.params.id;
      const banner = await Banner.findByIdAndDelete(bannerId);
      if (!banner) {
        return res.status(404).json({ status: false, message: "Banner not found" });
      }
      res.json({ status: true, message: "Banner deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting banner" });
    }
  };
  

module.exports = { getBannerPage, addBanner, updateBanner, getBanner, deleteBanner ,getBannerById };
