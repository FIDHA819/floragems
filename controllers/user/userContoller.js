const User = require("../../models/userschema");
const dotenv = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const WalletTransaction = require("../../models/walletSchema");
const { resolveHostname } = require("nodemailer/lib/shared");
const Product=require("../../models/productSchema")
const Category=require("../../models/categorySchema");
const Brand=require("../../models/brandSchema")
const Banner=require("../../models/bannerSchema")


function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const generateAndSendOtp = async (req, res) => {
  try {
    if (req.session.userOtp && Date.now() < req.session.otpExpiration) {
      return res.status(400).json({ success: false, message: "OTP already sent. Please check your email/phone." });
    }

    const otp = generateOtp();
    const otpExpiration = Date.now() + 5 * 60 * 1000;

    req.session.userOtp = otp;
    req.session.otpExpiration = otpExpiration;

    sendOtp(req.session.userData, otp);

    return res.json({ success: true, message: "OTP sent successfully." });
  } catch (error) {
    console.error("Error generating OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};

// Utility: Send Verification Email
async function sendVerificationEmail(email, otp) {
  try {
    if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASSWORD) {
      console.error("❌ Nodemailer credentials are missing.");
      return false;
    }

    console.log(`📩 Sending OTP to: ${email}`); // Debugging line

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const mailOptions = {
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: "Verify Your Account",
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP: ${otp}</b>`,
    };

    const info = await transporter.sendMail(mailOptions);

    console.log(`✅ Email sent: ${info.response}`);
    return info.accepted.length > 0;
  } catch (error) {
    console.error("❌ Error sending email:", error);
    return false;
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
      const banners = await Banner.find({ isActive: true });

      const brands = await Brand.find({ isBlocked: false });
      console.log(brands); 
      const categories = await Category.find({ isListed: true });

      let productData = await Product.find({
          isBlocked: false,
          category: { $in: categories.map((category) => category._id) },
          quantity: { $gt: 0 },
      });

      productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
      productData = productData.slice(0, 4);

      res.render("user/home", { user: userData, products: productData,banners:banners,categories:categories ,brands:brands});
  } catch (error) {
      console.error("Home Page Error:", error);
      res.status(500).send("Server error: Unable to load home page");
  }
};

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

  
// Handle Signup Submission
const signup = async (req, res) => {
  try {
    const { name, email, password, phone, cPassword, referralCode } = req.body;

    if (password !== cPassword) {
      return res.render("user/signup", { message: "Passwords do not match." });
    }

    if (!email || !password || !name) {
      return res.render("user/signup", { message: "All fields are required." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.render("user/signup", { message: "Email already exists." });
    }

    // Generate a referral code for the new user
    const newReferralCode = generateReferralCode();

    // Check if referral code is provided and valid
    let referrer = null;
    if (referralCode) {
      referrer = await User.findOne({ referralCode });
      if (!referrer) {
        return res.render("user/signup", { message: "Invalid referral code." });
      }
    }

    // Check if OTP is already generated in the session
    if (req.session.userOtp) {
      return res.render("user/verify-otp", { message: "OTP already sent. Please verify it." });
    }

    // Generate OTP for email verification
    const otp = generateOtp();
    const otpExpiration = Date.now() + 5 * 60 * 1000;
 
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.render("user/signup", { message: "Error sending email. Try again." });
    }
    

    // Save the session data
    req.session.userOtp = otp;
    req.session.userData = { name, email, password, phone, referralCode: newReferralCode };
    req.session.referrer = referrer; // Save referrer information if available
    req.session.otpExpiration = otpExpiration;
    console.log("Generated otp:",otp)

    // Render OTP verification page
    res.render("user/verify-otp", { resendAllowed: true });
  } catch (error) {
    console.error("Signup error:", error);
    res.redirect("/error");
  }
};

// Function to generate a unique referral code (simple example)
const generateReferralCode = () => {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
};

// Handle Referral Code Processing
const handleReferralCode = async (req, res) => {
  try {
    const { referralCode } = req.body;
    if (referralCode) {
      const referrer = await User.findOne({ referralCode });
      if (referrer) {
        // Store referrer details in the session
        req.session.referrer = {
          referralCode: referrer.referralCode,
          userId: referrer._id,
        };
        console.log("Referral code valid. Referrer added to session.");
      } else {
        return res.status(400).json({ success: false, message: "Invalid referral code." });
      }
    }
    return res.status(200).json({ success: true, message: "Referral code processed successfully." });
  } catch (error) {
    console.error("Error processing referral code:", error);
    res.status(500).json({ success: false, message: "An error occurred." });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (req.session.otpVerified) {
      return res.status(400).json({ success: false, message: "OTP already verified." });
    }

    if (!req.session.userOtp || Date.now() > req.session.otpExpiration) {
      return res.status(400).json({ success: false, message: "OTP has expired or session is invalid. Please request a new OTP." });
    }

    if (otp.trim() === req.session.userOtp) {
      const user = req.session.userData;
      const passwordHash = await securePassword(user.password);

      const newUser = new User({
        name: user.name,
        email: user.email,
        phone: user.phone,
        password: passwordHash,
        referralCode: user.referralCode,
      });

      await newUser.save();

      // ✅ Set Session Properly
      req.session.user = {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
      };

      req.session.otpVerified = true;
      req.session.userOtp = null; // Remove OTP from session
      req.session.userData = null; // Remove temporary user data

      return res.json({ success: true, redirectUrl: "/" });
    } else {
      res.status(400).json({ success: false, message: "Invalid OTP" });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ success: false, message: "An error occurred" });
  }
};


const createWalletTransaction = async (userId, amount, type, description) => {
  try {
    console.log("Creating wallet transaction:", {
      userId,
      amount,
      type,
      description,
    });

    const transaction = new WalletTransaction({
      userId,
      amount,
      type,
      description,
      source: "Referral", // Source is Referral for this case
    });

    // Save the transaction to the database
    await transaction.save();
    console.log("Wallet transaction saved:", transaction);
  } catch (error) {
    console.error("Error creating wallet transaction:", error);
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

 const resendOtp = async (req, res) => {
      try {
        const { userData, lastResendTime } = req.session;
    
        if (!userData || !userData.email) {
          return res.status(400).json({ success: false, message: "Email not found in session." });
        }
    
        const currentTime = Date.now();
        if (lastResendTime && currentTime - lastResendTime < 30000) {
          return res.status(429).json({ success: false, message: "Please wait before requesting another OTP." });
        }
    
        const { email } = userData;
    
        // Generate new OTP
        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.lastResendTime = currentTime;
    
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
    


    const loadLogin = async (req, res) => {
      try {
        if (!req.session.user) {
          const message = req.session.message || null; // Retrieve message from session
          req.session.message = null; // Clear session message after fetching
          return res.render("user/login", { message }); // Pass message to the view
        } else {
          return res.redirect("/"); // Redirect to home page if user is already logged in
        }
      } catch (error) {
        console.error("Error loading login page:", error); // Log the error for debugging
        return res.redirect("/page-404"); // Redirect to a custom 404 page
      }
    };
    
const loadBlockedPage = async (req, res) => {
  try {
    // Render a page indicating the user is blocked
    res.render("user/blocked"); // Create this view in your 'views/user' folder
  } catch (error) {
    console.error("Error rendering blocked page:", error);
    res.status(500).send("Error rendering blocked page");
  }
};

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
        return res.redirect("/blocked"); // Redirect to the blocked page
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
const profilename = async (req, res) => {
  try {
      if (!req.user) {
          return res.status(400).json({ error: "User not authenticated" });
      }

      const { name, phone } = req.body;

      const updatedUser = await User.findByIdAndUpdate(
          req.user._id,
          { name, phone },
          { new: true }
      );

      if (!updatedUser) {
          return res.status(404).json({ error: "User not found" });
      }

      res.redirect('/userProfile');
  } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).send("Internal server error");
  }
};
const loadShoppingPage = async (req, res) => {
  try {
    const user = req.session.user || null;
    const userData = await User.findOne({ _id: user });
    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({ isBlocked: false }).select("brandName brandImage");

    const query = req.query.query || '';
    const sort = req.query.sort || 'latest';
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    console.log("Query Parameters:", req.query);

    let searchQuery = {};
    if (query) {
      searchQuery.$text = { $search: query };
    }

    let sortOption = {};
    if (sort === 'latest') {
      sortOption.createdAt = -1;
    } else if (sort === 'priceAsc') {
      sortOption.salePrice = 1;
    } else if (sort === 'priceDesc') {
      sortOption.salePrice = -1;
    } else if (sort === 'popularity') {
      sortOption.popularity = -1;
    } else if (sort === 'az') {
      sortOption.name = 1;
    } else if (sort === 'za') {
      sortOption.name = -1;
    }

    const categoryIds = categories.map((category) => category._id.toString());

    console.log("Search Query:", searchQuery);
    console.log("Sort Option:", sortOption);

    const products = await Product.find({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
      ...searchQuery,
    })
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments({
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
      ...searchQuery,
    });

    const totalPages = Math.ceil(totalProducts / limit);
    const metalTypes = ["Gold", "Diamond", "Silver", "Platinum", "Other"];

    res.render("user/shop", {
      user: userData,
      products,
      categories,
      brands,
      metalTypes,
      sortOption: sort,
      totalProducts,
      currentPage: page,
      totalPages,
      searchQuery: query,
    });
  } catch (error) {
    console.error("Error loading shopping page:", error);
    res.redirect("/pageNotFound");
  }
};

const getFilteredProducts = async (req, res) => {
  try {
    const { query, category, brand, price, metal, sort } = req.query;
    const user = req.session.user || null;
    const userData = await User.findOne({ _id: user });
    const categories = await Category.find({ isListed: true });
    const brands = await Brand.find({ isBlocked: false }).select("brandName brandImage");
console.log(brands)
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

    console.log("Query Parameters:", req.query);

    let searchQuery = {};
    if (query) {
      searchQuery.$text = { $search: query };
    }

    let filterQuery = {};
    if (category) {
      filterQuery.category = category;
    }
    if (brand) {
      filterQuery.brand = brand;
    }
    if (metal) {
      filterQuery.metalType = metal;
    }
    if (price) {
      const [minPrice, maxPrice] = price.split('-').map(Number);
      filterQuery.salePrice = { $gte: minPrice, $lte: maxPrice };
    }

    const queryCondition = { ...searchQuery, ...filterQuery };

    console.log("Search Query:", searchQuery);
    console.log("Filter Query:", filterQuery);
    console.log("Query Condition:", queryCondition);

    let sortOption = {};
    if (sort === 'latest') {
      sortOption.createdAt = -1;
    } else if (sort === 'priceAsc') {
      sortOption.salePrice = 1;
    } else if (sort === 'priceDesc') {
      sortOption.salePrice = -1;
    } else if (sort === 'popularity') {
      sortOption.popularity = -1;
    } else if (sort === 'az') {
      sortOption.name = 1;
    } else if (sort === 'za') {
      sortOption.name = -1;
    }

    console.log("Sort Option:", sortOption);

    const products = await Product.find(queryCondition)
      .sort(sortOption)
      .skip(skip)
      .limit(limit);

    const totalProducts = await Product.countDocuments(queryCondition);
    const totalPages = Math.ceil(totalProducts / limit);
    const metalTypes = ["Gold", "Diamond", "Silver", "Platinum", "Other"];

    res.render("user/shop", {
      user: userData,
      products,
      categories,
      brands,
      metalTypes,
      searchQuery: query,
      selectedCategory: category,
      selectedBrand: brand,
      selectedPrice: price,
      selectedMetal: metal,
      sortOption: sort,
      totalProducts,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    console.error("Error fetching filtered products:", error);
    res.status(500).send("Error fetching products");
  }
};
const getReferralPage = async (req, res) => {
  try {
    const userId = req.session?.user?._id; 

    if (!userId) {
      return res.status(401).redirect("/login"); 
    }
    const user = await User.findById(userId);
    if (!user) {
        return res.status(404).send("User not found").redirect("/login");
    }

    
    res.render("user/referral", {
        referralCode: user.referralCode,
        walletBalance: user.wallet, 
        redeemedUsers: user.redeemedUsers || [], // Pass the redeemedUsers array
    });
  } catch (error) {
      console.error("Error fetching referral page:", error);
      res.status(500).send("Internal Server Error");
  }
};




// Export Controllers
module.exports = {
  loadHomePage,
  pageNotFound,
  generateAndSendOtp,
  loadSignup,
  signup,
  verifyOtp,
  resendOtp,
  loadLogin,
  login,
  logout,
  loadShoppingPage,
  profilename,
  getFilteredProducts,
  loadBlockedPage,
  getReferralPage
};
