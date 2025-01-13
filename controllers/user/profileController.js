const User = require("../../models/userschema");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const env = require("dotenv").config();
const session = require("express-session"); 
const { response } = require("express");
const Address=require("../../models/addressSchema")
function generateOtp() {
    const digits = "1234567890";
    let otp = "";
    for (let i = 0; i < 6; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
}

const sendVerificationEmail = async (email, otp) => {
    try {
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

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL, // Fixed typo
            to: email,
            subject: "Your OTP for Password Reset",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4></b>`, // Fixed syntax
        };

        const info = await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password:", error);
    }
};

const getForgotPassPage = async (req, res) => {
    try {
        res.render("user/forgot-password"); // Correct path relative to the views folder
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const forgotEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email });
        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                res.render("user/forgotpass-otp"); // Correct path
                console.log("OTP:", otp);
            } else {
                res.json({ success: false, message: "Failed to send OTP. Please try again." });
            }
        } else {
            res.render("user/forgot-password", {
                message: "User with this email does not exist",
            });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const verifyForgotPassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        console.error("Error in OTP verification:", error);
        res.status(500).json({ success: false, message: "An error occurred. Please try again later" });
    }
};

const getResetPassPage = async (req, res) => {
    try {
        res.render("user/reset-password", { message: null }); // Pass a default value
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const resendOtp = async (req, res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp; 
        const email = req.session.email;
        console.log("Resending OTP to email:", email);

        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "Resend OTP successful" });
        } else {
            return res.status(500).json({ success: false, message: "Failed to send OTP email." });
        }
    } catch (error) {
        console.error("Error in resendOtp:", error);
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};

const postNewPassword = async (req, res) => {
    try {
        const { newPass1, newPass2 } = req.body;
        const email = req.session.email;

        // Ensure session is valid before proceeding with password reset
        if (!email || !req.session.userOtp) {
            return res.render("user/reset-password", { 
                message: "Session expired. Please request a new OTP." 
            });
        }

        if (newPass1 === newPass2) {
            const passwordHash = await securePassword(newPass1);
            const userExists = await User.findOne({ email });

            if (!userExists) {
                return res.render("user/reset-password", { 
                    message: "User not found." 
                });
            }

            const updateResult = await User.updateOne(
                { email },
                { $set: { password: passwordHash } }
            );

            if (updateResult.modifiedCount === 0) {
                return res.render("user/reset-password", { 
                    message: "Password update failed." 
                });
            }

            req.session.touch();  // Extend session expiry time

            // Clear session after successful password update
            req.session.destroy();  // Clear session data

            // Redirect to login page with a success message
            res.render("user/login", {
                message: "Your password has been successfully updated. Please log in with your new password."
            });
        } else {
            return res.render("user/reset-password", { 
                message: "Passwords do not match." 
            });
        }
    } catch (error) {
        console.error("Error updating password:", error);
        return res.redirect("/pageNotFound");
    }
};



const userProfile = async (req, res) => {
    try {
        const userId = req.session.user?._id; 
        console.log("Session User:", req.session.user);
        if (!userId) {
            return res.redirect("/login"); // Redirect to login if session user is missing
        }
const addressData=await Address.findOne({userId:userId})
        const userData = await User.findById(userId);
        if (!userData) {
            return res.redirect("/pageNotFound"); // Handle case where user data is not found
        }

        res.render("user/profile", { user: userData ,userAddress:addressData}); // Pass user data to template
    } catch (error) {
        console.error("Error retrieving profile data:", error);
        res.redirect("/pageNotFound");
    }
};

const changeEmail = async (req, res) => {
    try {
        res.render("user/change-email");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const changeEmailValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("user/change-email-otp");
                console.log("Email Sent:", email);
                console.log("OTP:", otp);
            } else {
                res.json("email-error");
            }
        } else {
            res.render("user/change-email", { message: "User with this email not exist" });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const verifyEmailOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;
        if (enteredOtp === req.session.userOtp) {
            req.session.userData = req.body.userData;
            res.render("user/new-email", {
                userData: req.session.userData,
            });
        } else {
            res.render("user/change-email-otp", {
                message: "OTP not matching",
                userData: req.session.userData
            });
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const updateEmail = async (req, res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user._id; // Ensure you access the user ID properly

        // Update the email in the database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { email: newEmail },
            { new: true } // This ensures the updated user document is returned
        );

        if (!updatedUser) {
            return res.redirect("/pageNotFound"); // Handle case where user is not found
        }

        // Update the email in the session
        req.session.user.email = updatedUser.email;

        // Save the session to persist the changes
        req.session.save((err) => {
            if (err) {
                console.error("Error saving session:", err);
                return res.redirect("/pageNotFound");
            }
            res.redirect("/userProfile");
        });
    } catch (error) {
        console.error("Error updating email:", error);
        res.redirect("/pageNotFound");
    }
};

const changePassword = async (req, res) => {
    try {
        // Ensure that the session is valid and contains necessary data
        if (!req.session.userOtp || !req.session.email) {
            return res.redirect("/forgot-password"); // Redirect to forgot password if session is missing
        }

        res.redirect("/forgot-password");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

const changePasswordValid = async (req, res) => {
    try {
        const { email } = req.body;
        const userExists = await User.findOne({ email });

        if (userExists) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email, otp);

            if (emailSent) {
                req.session.userOtp = otp;
                req.session.userData = req.body;

                // Extend session expiry time
                req.session.touch();

                console.log("Request Body:", req.body);
                res.render("user/change-password-otp"); // Ensure this path is correct
                console.log("OTP:", otp);
            } else {
                res.render("user/change-password", {
                    message: "Failed to send OTP. Please try again later."
                });
            }
        } else {
            res.render("user/change-password", {
                message: "User with this email does not exist."
            });
        }
    } catch (error) {
        console.error("Error in changePasswordValid:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyChangePassOtp = async (req, res) => {
    try {
        const enteredOtp = req.body.otp;

        // Ensure OTP session data exists
        if (!req.session.userOtp) {
            return res.json({
                success: false,
                message: "Session expired. Please request a new OTP."
            });
        }

        // Compare entered OTP with session OTP
        if (enteredOtp === req.session.userOtp) {
            res.json({ success: true, redirectUrl: "/reset-password" });
        } else {
            res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "An error occurred. Please try again later" });
    }
};
const addaddress = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            console.log("User not found in session");
            return res.redirect("/pageNotFound");
        }
        res.render("user/add-address", { user: user });
    } catch (error) {
        console.error("Error rendering add address page:", error);
        res.redirect("/pageNotFound");
    }
};

const postAddAddress = async (req, res) => {
    try {
        const userId = req.session.user; // Make sure this is an ObjectId or convert to ObjectId if needed
        if (!userId) {
            console.log("User ID not found in session");
            return res.redirect("/pageNotFound");
        }

        const userData = await User.findById(userId); // Directly using findById
        if (!userData) {
            console.log("User not found in database with ID:", userId);
            return res.redirect("/pageNotFound");
        }

        const { addressType, name, city, landMark, state, pincode, phone, altPhone } = req.body;

        // Log the received data for debugging
        console.log("Received address data:", req.body);

        const userAddress = await Address.findOne({ userId: userData._id });
        if (!userAddress) {
            const newAddress = new Address({
                userId: userData._id,
                address: [{ addressType, name, city, landMark, state, pincode, phone, altPhone }]
            });
            await newAddress.save();
            console.log("New address added for user:", userData._id);
        } else {
            userAddress.address.push({ addressType, name, city, landMark, state, pincode, phone, altPhone });
            await userAddress.save();
            console.log("Address added to existing address list for user:", userData._id);
        }

        res.redirect("/userProfile");
    } catch (error) {
        console.error("Error adding address:", error);
        res.redirect("/pageNotFound");
    }
};

const editAddress = async (req, res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id": addressId,
        });

        if (!currAddress) {
            return res.redirect("/pageNotFound");
        }

        const addressData = currAddress.address.find((item) => {
            return item._id.toString() === addressId.toString();
        });

        if (!addressData) {
            return res.redirect("/pageNotFound");
        }

        res.render("user/edit-address", { address: addressData, user: user });
    } catch (error) {
        console.error("Error in edit address", error);
        res.redirect("/pageNotFound");
    }
};

const postEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;

        // Find the address document containing the address with the specified ID
        const findAddress = await Address.findOne({
            "address._id": addressId
        });

        if (!findAddress) {
            return res.redirect("/pageNotFound"); // If address is not found
        }

        // Update the address inside the array using the $set operator
        await Address.updateOne(
            {
                "address._id": addressId // Find the specific address by its ID
            },
            {
                $set: {
                    "address.$": { // Update the specific address in the array
                        _id: addressId,
                        addressType: data.addressType,
                        name: data.name,
                        city: data.city,
                        landMark: data.landMark,
                        state: data.state, // Fixed this line, previously was setting city as state
                        pincode: data.pincode,
                        phone: data.phone,
                        altPhone: data.altPhone
                    }
                }
            }
        );

        res.redirect("/userProfile"); // Redirect to user profile after successful update
    } catch (error) {
        console.error("Error in edit address:", error);
        res.redirect("/pageNotFound"); // Handle errors and redirect
    }
};
const deleteAddress = async (req, res) => {
    try {
      const { addressId } = req.query;
  
      // Log the addressId received in the query parameters
      console.log("Address ID being passed:", addressId);
  
      // Ensure the addressId is valid (check if it's an ObjectId)
      if (!addressId) {
        return res.status(400).json({ error: "Address ID is required" });
      }
  
      // Find and delete the address using the provided addressId
      const address = await Address.findOneAndUpdate(
        { "address._id": addressId }, // Match the addressId inside the array
        { $pull: { address: { _id: addressId } } }, // Remove the address from the array
        { new: true } // Return the updated document
      );
  
      // Log the address document after deletion
      console.log("Updated Address Document:", address);
  
      // If no address is found, return a 404 error
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
  
      // Redirect to the user profile page after successful deletion
      res.redirect("/userProfile");
    } catch (error) {
      console.error("Error in delete address", error);
      res.redirect("/pageNotFound"); // Redirect to a custom error page in case of failure
    }
  };
  


module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    addaddress,
    postAddAddress,
    editAddress,
    postEditAddress,
    deleteAddress
};
