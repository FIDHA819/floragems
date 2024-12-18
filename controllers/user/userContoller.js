const User = require("../../models/userschema");
const dotenv = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const { resolveHostname } = require("nodemailer/lib/shared");

// Utility: Generate OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // Always 6 digits
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

// Controllers

// 404 Page Controller
const pageNotFound = async (req, res) => {
  try {
    console.log("Rendering 404 page");
    res.render("page-404");
  } catch (error) {
    console.error("Error rendering 404 page:", error);
    res.status(500).send("Error rendering 404 page");
  }
};

// Home Page Controller
const loadHomePage = async (req, res) => {
    try {
        const user = req.session.user; // Retrieve the user from session
        console.log("Session User:", user); // Check if the user is available in session

        if (user) {
            const userData = await User.findById(user._id); // Fetch user data from DB if necessary
            res.render("user/home", { user: userData }); // Pass user data to the view
        } else {
            console.log("No User Session Found");
            res.render("user/home", { user: null }); // Pass null if no user is logged in
        }
    } catch (error) {
        console.error("Home Page Error:", error);
        res.status(500).send("Server error: Unable to load home page");
    }
};



// Signup Page Controller
const loadSignup = async (req, res) => {
  try {
    return res.render("user/signup");
  } catch (error) {
    console.error("Signup page not loading:", error);
    res.status(500).send("Server error: Unable to load signup page");
  }
};

// Signup Form Submission Controller
const signup = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input fields
    if (!email || !password || !name) {
      return res.render("user/signup", { message: "All fields are required." });
    }

    // Check if user already exists
    const findUser = await User.findOne({ email });
    if (findUser) {
      return res.render("user/signup", { message: "User with this email already exists." });
    }

    // Generate OTP
    const otp = generateOtp();

    // Send verification email
    const emailSent = await sendVerificationEmail(email, otp);
    if (!emailSent) {
      return res.render("user/signup", { message: "Error sending verification email. Please try again." });
    }

    // Store OTP and user data in session
    req.session.userOtp = otp;
    req.session.userData = { name, email, password };

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

    // Check if OTP matches
    if (otp.toString().trim() === req.session.userOtp.toString().trim()) {
      const user = req.session.userData;

      // Hash password
      const passwordHash = await securePassword(user.password);

      // Save user to database
      const saveUserData = new User({
        name: user.name,
        email: user.email,
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
  logout
};
