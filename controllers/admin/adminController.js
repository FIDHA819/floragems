const User = require("../../models/userschema");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const pageerror=async(req,res)=>{
    res.render("admin/page-404")
}

// Load Admin Login Page
const loadLogin = (req, res) => {
    if (req.session.admin) {
        return res.redirect("/admin/dashboard");
    }
    res.render("admin/admin-login", { message: null });
};

// Admin Login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find admin by email and check isAdmin flag
        const admin = await User.findOne({ email: email, isAdmin: true });

        if (!admin) {
            console.log("Admin not found");
            return res.render("admin/admin-login", { message: "Invalid credentials" });
        }

        // Check if the password matches
        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            console.log("Incorrect password");
            return res.render("admin/admin-login", { message: "Invalid credentials" });
        }

        // Set admin session and redirect to dashboard
        req.session.admin = true;
        console.log("Admin logged in successfully");
        return res.redirect("/admin/dashboard");
    } catch (error) {
        console.error("Admin login error:", error);
        return res.redirect("/pageerror");
    }
};

// Load Admin Dashboard
const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            return res.render("admin/admin-dashboard");
        } catch (error) {
            console.error("Error loading admin dashboard:", error);
            return res.redirect("/pageerror");
        }
    } else {
        return res.redirect("/admin/login");
    }
};
const logout=async(req,res)=>{
    try {
        req.session.destroy(err=>{
            if(err){
                console.log("Error destroying session");
                return res.redirect("/pageerror")

            }
            res.redirect("/admin/login")
        })
    } catch (error) {
        console.log("Unexpected eror during logout",error);
        res.redirect("/pageerror")
        
    }
}

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout
};
