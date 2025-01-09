const User = require("../../models/userschema");
const dotenv = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { resolveHostname } = require("nodemailer/lib/shared");
const Product=require("../../models/productSchema")
const Category=require("../../models/categorySchema");
const Brand=require("../../models/brandSchema")

// Utility: Generate OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // js fixed way to Always 6 digits
}

// Utility: Send Verification Email
async function sendVerificationEmail(email, otp) {
  try {
    // Ensure environment variables are set
    if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
      console.error("Nodemailer credentials are missing in environment variables.");
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify Your Account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    });

    return info.accepted.length > 0; // Return true if email sent
  } catch (error) {
    console.error("Error sending verification email:", error);
    return false; // Return false on error
  }
}



// 404 Page Controller
const pageNotFound = async (req, res) => {
  try {
    console.log("Rendering 404 page");
    res.render("user/page-404");
  } catch (error) {
    console.error("Error rendering 404 page:", error);
    res.status(500).send("Error rendering 404 page");
  }
};

// Home Page Controller
const loadHomePage = async (req, res) => {
  try {
      const userId = req.session.user?._id;
      const userData = userId ? await User.findById(userId) : null;

      const categories = await Category.find({ isListed: true });
      let productData = await Product.find({
          isBlocked: false,
          category: { $in: categories.map((category) => category._id) },
          quantity: { $gt: 0 },
      });

      productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
      productData = productData.slice(0, 4);

      res.render("user/home", { user: userData, products: productData });
  } catch (error) {
      console.error("Home Page Error:", error);
      res.status(500).send("Server error: Unable to load home page");
  }
};



// Signup Page Controller
// Signup Page Controller
const loadSignup = async (req, res) => {
  try {
    const message = req.session.message || null; // Retrieve message from session, if available
    req.session.message = null; // Clear the session message after fetching it
    return res.render("user/signup", { message }); // Pass message to the view
  } catch (error) {
    console.error("Signup page not loading:", error);
    res.status(500).send("Server error: Unable to load signup page");
  }

};



const signup = async (req, res) => {
  try {
    const { name, email, password, phone, cPassword } = req.body;  // Make sure to capture cPassword
    const message = req.session.message || null;

    if (password !== cPassword) {
      req.session.message = "Passwords do not match.";  // Set message to session
      return res.render("user/signup", { message: req.session.message });
    }

    // Validate input fields
    if (!email || !password || !name) {
      req.session.message = "All fields are required.";
      return res.render("user/signup", { message: req.session.message });
    }

    // Check if user already exists
    const findUser = await User.findOne({ email });
    if (findUser) {
      req.session.message = "User with this email already exists.";
      return res.render("user/signup", { message: req.session.message });
    }

    // Generate OTP
    const otp = generateOtp();
    const expirationTime = Date.now() + 5 * 60 * 1000;

    // Send verification email
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      req.session.message = "Error sending verification email. Please try again.";
      return res.render("user/signup", { message: req.session.message });
    }

    // Store OTP and user data in session
    req.session.userOtp = otp;
    req.session.userData = { name, email, password, phone };
    req.session.otpExpiration = expirationTime;

    console.log("OTP Sent:", otp);
    return res.render("user/verify-otp");

  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/pageNotFound");
  }
};


// Password Hashing Function
const securePassword = async (password) => {
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    return passwordHash;
  } catch (error) {
    console.error("Error hashing password:", error);
    throw new Error("Password hashing failed");
  }
};

// Verify OTP Controller
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    console.log("Received OTP:", otp);

    // Ensure session data exists
    if (!req.session.userOtp || !req.session.userData) {
      console.error("No OTP or user data in session");
      return res.status(400).json({ success: false, message: "Session expired. Please try again." });
    }


    if (Date.now() > req.session.otpExpiration) {
      return res.send({ success: false, message: "OTP has expired. Please request a new one." });
  }
    // Check if OTP matches
    if (otp.toString().trim() === req.session.userOtp.toString().trim()) {
      const user = req.session.userData;

      // Hash password
      const passwordHash = await securePassword(user.password);

      // Save user to database
      const saveUserData = new User({
        name: user.name,
        email: user.email,
        phone:user.phone,
        password: passwordHash,
        ...(user.googleId && { googleId: user.googleId }),
      });

      await saveUserData.save();
      console.log("User saved to database:", saveUserData);

      // Store user ID in session
      req.session.user = saveUserData._id;

      // Respond with success
      res.json({ success: true, redirectUrl: "/" });
    } else {
      console.error("Invalid OTP received:", otp);
      res.status(400).json({ success: false, message: "Invalid OTP, please try again" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

// Resend OTP Controller
const resendOtp = async (req, res) => {
  try {
    if (!req.session.userData || !req.session.userData.email) {
      return res.status(400).json({ success: false, message: "Email not found in session." });
    }

    const { email } = req.session.userData;

    // Generate new OTP
    const otp = generateOtp();
    req.session.userOtp = otp;

    // Send verification email
    const emailSent = await sendVerificationEmail(email, otp);
    if (emailSent) {
      console.log("Resend OTP:", otp);
      return res.status(200).json({ success: true, message: "OTP resent successfully." });
    } else {
      return res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again." });
    }
  } catch (error) {
    console.error("Error resending OTP:", error);
    res.status(500).json({ success: false, message: "Internal Server Error. Please try again later." });
  }
};

const loadLogin =async(req,res)=>{
    try {
        if(!req.session.user){
            return res.render("user/login")
        }else{
            res.redirect("/")
        }   
    } catch (error) {
        res.redirect("/page-404")
        
    }
}

const login = async (req, res) => {
  try {
      console.log("Login Controller Triggered");

      const { email, password } = req.body;
      console.log("Email:", email, "Password:", password);

      const findUser = await User.findOne({ isAdmin: 0, email: email });
      if (!findUser) {
          console.log("User not found");
          return res.render("user/login", { message: "User Not Found" });
      }

      if (findUser.isBlocked) {
          console.log("User is blocked");
          return res.render("user/login", { message: "User Is Blocked By Admin" });
      }

      const passwordMatch = await bcrypt.compare(password, findUser.password);
      if (!passwordMatch) {
          console.log("Incorrect password");
          return res.render("user/login", { message: "Incorrect Password" });
      }

      // Store the full user object (or relevant properties) in the session
      req.session.user = {
          _id: findUser._id,
          name: findUser.name,
          email: findUser.email,
      };

      console.log("Session Set for User:", req.session.user); // Log session data

      res.redirect("/");
  } catch (error) {
      console.error("Login error:", error);
      res.render("user/login", { message: "Login failed" });
  }
  
  


};

const logout=async(req,res)=>{
  try{
    req.session.destroy((err)=>{
      if(err){
        console.log("Session Destruction error",err.message);
        return res.redirect("/pageNotFound")
        
      }
      return res.redirect("/login")
    })
  }catch(error){
    console.log("Logout error",error);
    res.redirect("/pageNotFound")
    
  }
}

const loadShoppingPage = async (req, res) => {
  try {
    const user = req.session.user || null; // Get user data from session
    const userData = await User.findOne({ _id: user });
    const categories = await Category.find({ isListed: true }); // Fetch categories
    const brands = await Brand.find({ isBlocked: false }).select("brandName brandImage");
    console.log("Fetched Brands:", brands); // Debug to check fetched brands
    


    const categoryIds = categories.map((category) => category._id.toString());
    const page = parseInt(req.query.page) || 1;
    const limit = 9;
    const skip = (page - 1) * limit;

    const products = await Product.find({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    })
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    });
    const totalPages = Math.ceil(totalProducts / limit);
    const metalTypes = ["Gold", "Diamond", "Silver", "Platinum", "Other"];

    res.render("user/shop", {
      user: userData,
      products: products,
      categories: categories, // Pass categories to the view
      brands: brands,
      metalTypes:metalTypes,
      totalProducts: totalProducts,
      currentPage: page,
      totalPages: totalPages,
    });
  } catch (error) {
    console.error("Error loading shopping page:", error);
    res.redirect("/pageNotFound");
  }
};

const filterProduct = async (req, res) => {
  try {
    const user = req.session.user; // User session
    const { categories, brand, page } = req.query; // Query parameters
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = 6;

    // Fetch categories and brands
    const categoriesList = await Category.find({ isListed: true }).lean();
    const brandsList = await Brand.find({}).lean();

    // Build the query object
    const query = {
      isBlocked: false,
      quantity: { $gt: 0 },
    };

    // Add category filter if available
    if (categories) {
      const categoryId = categories; // Assuming the category is passed as ObjectId in the query string
      const findCategory = await Category.findById(categoryId).lean();
      if (findCategory) {
        query.category = findCategory._id; // Match category by ObjectId
      } else {
        console.warn(`Invalid category ID: ${categoryId}`);
      }
    }

    // Add brand filter if available
    if (brand) {
      // Ensure the brand filter is passed as an ObjectId
      const findBrand = await Brand.findById(brand).lean(); // Use findById to search by ObjectId
      if (findBrand) {
        query.brand = findBrand.brandName; // Match brand by ObjectId, not by name
      } else {
        console.warn(`Invalid brand ID: ${brand}`);
      }
    }

    console.log("Final Query:", query);

    // Fetch filtered products
    const allProducts = await Product.find(query).lean();
    console.log("Filtered Products:", allProducts);

    // Sort products by creation date (descending)
    allProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination logic
    const totalPages = Math.ceil(allProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProduct = allProducts.slice(startIndex, startIndex + itemsPerPage);

    // Fetch user data for history (if logged in)
    let userData = null;
    if (user) {
      userData = await User.findById(user);
      if (userData && Array.isArray(userData.searchHistory)) {
        userData.searchHistory.push({
          category: categories || null,
          brand: brand || null,
          searchedOn: new Date(),
        });
        await userData.save();
      }
    }

    // Render the shop page
    res.render("user/shop", {
      user: userData,
      products: currentProduct,
      categories: categoriesList,
      brands: brandsList,
      totalPages,
      currentPage,
      selectedCategory: categories || null,
      selectedBrand: brand || null,
    });
  } catch (error) {
    console.error("Error in filterProduct:", error);
    res.redirect("/pageNotFound");
  }
};
const filterByPrice=async(req,res)=>{
  try {
    const user = req.session.user; // User session
    const userData=await User.findOne({_id:user});
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({}).lean();
let finalProduct=await Product.find({
  salePrice:{$gt:req.query.gt,$lt:req.query.lt},
  isBlocked: false,
  quantity: { $gt: 0 }
}).lean()
    
  } catch (error) {
    findProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = 6;
    // Pagination logic
    const totalPages = Math.ceil(findProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProduct = findProducts.slice(startIndex, startIndex + itemsPerPage);
req.session.filteredProducts=findProducts;
res.render("user/shop", {
  user: userData,
  products: currentProduct,
  categories: categories,
  brands: brands,
  totalPages,
  currentPage,
  selectedCategory: categories || null,
  selectedBrand: brand || null,
})

  }
}
const filterByMetal = async (req, res) => {
  try {
    const user = req.session.user; // User session
    const userData = await User.findOne({ _id: user });
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({}).lean();
    
    const { metal, page } = req.query; // Get metal filter from query params
    const currentPage = parseInt(page) || 1;
    const itemsPerPage = 6;

    // Build the query object for filtering
    let query = {
      isBlocked: false,
      quantity: { $gt: 0 }
    };

    // Check if the 'metal' filter is passed in the query
    if (metal) {
      query.metalType = metal; // Filter by metal type (e.g., 'Gold', 'Diamond', etc.)
    }

    // Fetch filtered products based on the query
    let filteredProducts = await Product.find(query).lean();

    // If no products found for the selected metal, log a message
    if (filteredProducts.length === 0) {
      console.log(`No products found for metal type: ${metal}`);
    }

    // Sort the products by creation date (descending)
    filteredProducts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination logic
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProduct = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

    // Render the page with filtered products and pagination
    res.render("user/shop", {
      user: userData,
      products: currentProduct,
      categories: categories,
      brands: brands,
      totalPages,
      currentPage,
      selectedMetal: metal || null, // Pass the selected metal type
    });
  } catch (error) {
    console.error("Error in filterByMetal:", error);
    res.redirect("/pageNotFound"); // Redirect to a 404 page if there's an error
  }
};
const searchProducts = async (req, res) => {
  try {
    console.log("Search query received:", req.body.query); // Debug
    const user = req.session.user;
    const userData = await User.findOne({ _id: user });
    const search = req.body.query || ''; // Default to empty string
    console.log("User session:", userData); // Debug

    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({}).lean();
    const categoryIds = categories.map(category => category._id.toString());
    console.log("Category IDs:", categoryIds); // Debug

    const currentPage = parseInt(req.query.page) || 1;
    const itemsPerPage = 6;

    let searchResults = [];
    if (req.session.filteredProducts && req.session.filteredProducts.length > 0) {
      console.log("Using session filtered products"); // Debug
      searchResults = req.session.filteredProducts.filter(product =>
        product.productName.toLowerCase().includes(search.toLowerCase())
      );
    } else {
      console.log("Fetching products from database"); // Debug
      searchResults = await Product.find({
        productName: { $regex: search, $options: 'i' },
        isBlocked: false,
        quantity: { $gt: 0 },
        category: { $in: categoryIds },
      }).lean();
    }

    console.log("Search results found:", searchResults.length); // Debug

    // Pagination
    const totalPages = Math.ceil(searchResults.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProduct = searchResults.slice(startIndex, startIndex + itemsPerPage);

    res.render('user/shop', {
      user: userData,
      products: currentProduct,
      categories: categories,
      brands: brands,
      totalPages,
      currentPage,
      count: searchResults.length,
    });
  } catch (error) {
    console.error("Error in searchProducts:", error);
    res.redirect('/pageNotFound');
  }
};const sortPage = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true }).lean();
    const brands = await Brand.find({}).lean();
    
    const sortOption = req.query.sort || "latest"; // Default to "latest"
    let sortCriteria = {};

    // Determine sorting criteria based on the selected option
    if (sortOption === "latest") {
        sortCriteria = { createdAt: -1 }; // Sort by newest first
    } 

    // Fetch sorted products
    const products = await Product.find({ isBlocked: false, quantity: { $gt: 0 } })
        .sort(sortCriteria)
        .lean();

    // Pagination logic
    const currentPage = parseInt(req.query.page) || 1;
    const itemsPerPage = 6;
    const totalPages = Math.ceil(products.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const currentProduct = products.slice(startIndex, startIndex + itemsPerPage);

    // Render the page with sorted products and categories
    res.render("user/shop", {
        user: req.session.user,
        products: currentProduct, // Paginated products
        categories: categories, // Pass categories to the view
        sortOption: sortOption,
        brands: brands,
        totalPages: totalPages,
        currentPage: currentPage,
    });
  } catch (error) {
    console.error(error);
    res.redirect("/pageNotFound");
  }
};

// Export Controllers
module.exports = {
  loadHomePage,
  pageNotFound,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  logout,
  loadShoppingPage,
  filterProduct,
  filterByPrice,
  filterByMetal,
  searchProducts,
  sortPage
};
